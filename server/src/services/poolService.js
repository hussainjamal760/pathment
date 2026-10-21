const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { createAuditLog } = require('../utils/auditContext');
const { generateRandomToken, hashToken } = require('../utils/jwt');
const { inviteLink } = require('../utils/links');
const { endOfDayInZone } = require('../utils/timezone');
const { scoreMember, rankMembers, bucketFor, OPEN_STATUSES } = require('../utils/poolScoring');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const authzService = require('./authzService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_DAYS = 14;
const DAY_MS = 86400000;
const MAX_SNAPSHOTS = 20;
// Pool work is a test, not a learning task: no Buildment seats are spent on it.
const POOL_TASK_TYPES = ['custom', 'reading', 'video', 'exercise', 'project', 'open_source', 'quiz', 'interview'];
const FINAL_DECISIONS = ['selected', 'waitlisted', 'not_selected'];
const WRITABLE_POOL_FIELDS = ['name', 'description', 'capacity', 'selectionQuota', 'opensAt', 'closesAt', 'qualificationDueAt', 'reminderPolicy', 'cohortId'];

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const fullName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : null);

/**
 * Selection pools: candidates who are on the platform but not yet in a clan.
 *
 * Every piece of qualification work is an ordinary AssignedTask carrying
 * `poolMemberId`, with no clan and no enrolment — so it uses the existing
 * submission, review and quiz flows and never moves anybody's progress.
 * The system scores and proposes; a person with `pool.select` decides.
 */
class PoolService {
  // ── Pools ──────────────────────────────────────────────────────────────────

  async list(user) {
    const scope = await authzService.programScopeFor(user, 'admin');
    const where = scope.unrestricted ? {} : { programId: { [Op.in]: scope.programIds } };
    const pools = await models.CandidatePool.findAll({
      where,
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });
    const counts = pools.length ? await models.PoolMember.findAll({
      where: { poolId: { [Op.in]: pools.map((p) => p.id) } },
      attributes: ['poolId', 'decision', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
      group: ['poolId', 'decision'],
      raw: true
    }) : [];
    return pools.map((p) => {
      const mine = counts.filter((c) => c.poolId === p.id);
      return {
        ...this._shape(p),
        memberCount: mine.reduce((a, c) => a + Number(c.n), 0),
        selectedCount: Number(mine.find((c) => c.decision === 'selected')?.n || 0)
      };
    });
  }

  async get(poolId) {
    const pool = await models.CandidatePool.findByPk(poolId, {
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
        { model: models.Cohort, as: 'cohort', attributes: ['id', 'name'] }
      ]
    });
    if (!pool) throw new NotFoundError('Pool not found');
    return pool;
  }

  async create(data, actor) {
    const program = await models.Program.findByPk(data.programId, { attributes: ['id'] });
    if (!program) throw new NotFoundError('Program not found');
    await this._assertCohortInProgram(data.cohortId, data.programId);
    const pool = await models.CandidatePool.create({
      ...this._pick(data),
      programId: data.programId,
      scoringPolicy: { version: 1, components: this._normalizeComponents(data.components || []) },
      createdById: actor.id
    });
    await this._audit(actor, 'POOL_CREATED', pool.id, { name: pool.name, programId: pool.programId });
    return this._shape(await this.get(pool.id));
  }

  /**
   * Edit settings. Weights are part of the scoring policy: changing them makes
   * a new policy version, and earlier shortlist snapshots stay as they were.
   */
  async update(poolId, data, actor) {
    const pool = await this.get(poolId);
    if (pool.status === 'closed') throw new ValidationError('This pool is closed');
    if (data.cohortId) await this._assertCohortInProgram(data.cohortId, pool.programId);
    const patch = this._pick(data);
    if (data.components) {
      const byKey = new Map((pool.scoringPolicy.components || []).map((c) => [c.key, c]));
      patch.scoringPolicy = {
        version: (pool.scoringPolicy.version || 1) + 1,
        // Weights and labels are edited here; the work behind each component
        // only grows through assignWork, so editing cannot orphan a task.
        components: this._normalizeComponents(data.components).map((c) => ({
          ...c, roadmapTaskIds: byKey.get(c.key)?.roadmapTaskIds || [], items: byKey.get(c.key)?.items || []
        }))
      };
    }
    await pool.update(patch);
    await this._audit(actor, 'POOL_UPDATED', pool.id, patch);
    return this._shape(await this.get(pool.id));
  }

  /** Move the pool through its life. Closing stops every reminder. */
  async setStatus(poolId, status, actor) {
    const pool = await this.get(poolId);
    if (pool.status === 'closed') throw new ValidationError('A closed pool cannot be reopened');
    await pool.update({ status });
    await this._audit(actor, 'POOL_STATUS_CHANGED', pool.id, { status });
    return this._shape(await this.get(pool.id));
  }

  // ── Candidates ─────────────────────────────────────────────────────────────

  /**
   * Add candidates by email. Safe to retry: an email already in the pool is
   * reported, never duplicated, and an existing account joins straight away
   * instead of being invited again.
   */
  async importMembers(poolId, { emails = [] }, actor) {
    const pool = await this.get(poolId);
    if (['placing', 'closed'].includes(pool.status)) throw new ValidationError('This pool no longer takes candidates');

    const results = [];
    const seen = new Set();
    let size = await models.PoolMember.count({ where: { poolId } });
    for (const raw of emails) {
      const email = normalizeEmail(raw);
      if (!EMAIL_RE.test(email)) { results.push({ email: raw, result: 'invalid' }); continue; }
      if (seen.has(email)) { results.push({ email, result: 'duplicate_row' }); continue; }
      seen.add(email);

      const existing = await models.PoolMember.findOne({ where: { poolId, email } });
      if (existing) { results.push({ email, result: 'already_in_pool', memberId: existing.id }); continue; }
      if (pool.capacity && size >= pool.capacity) { results.push({ email, result: 'pool_full' }); continue; }

      try {
        const user = await models.User.findOne({ where: { email }, attributes: ['id'] });
        const member = user
          ? await models.PoolMember.create({ poolId, email, userId: user.id, status: 'active' })
          : await this._inviteMember(pool, email, actor);
        size += 1;
        results.push({ email, result: user ? 'added' : 'invited', memberId: member.id });
        if (user) await this._assignConfiguredWork(pool, member, actor);
      } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError') throw error;
        results.push({ email, result: 'already_in_pool' }); // a concurrent retry won
      }
    }
    await this._audit(actor, 'POOL_MEMBERS_IMPORTED', pool.id, {
      added: results.filter((r) => ['added', 'invited'].includes(r.result)).length
    });
    return { results };
  }

  /**
   * An invited candidate registered: attach their new account to every pool
   * that was waiting on their email and give them the work already set.
   * Called from registration; matches on email so an account made any other
   * way still finds its pool.
   */
  async activateForUser(user, { transaction } = {}) {
    const members = await models.PoolMember.findAll({
      where: { email: normalizeEmail(user.email), userId: null, decision: null }, transaction
    });
    for (const member of members) {
      await member.update({ userId: user.id, status: 'active' }, { transaction });
    }
    return members;
  }

  /** Assign the pool's configured work to members activated by registration. */
  async assignConfiguredWorkForUser(userId) {
    const members = await models.PoolMember.findAll({
      where: { userId, decision: null },
      include: [{ model: models.CandidatePool, as: 'pool' }]
    });
    for (const member of members) {
      if (member.pool && !['placing', 'closed'].includes(member.pool.status)) {
        await this._assignConfiguredWork(member.pool, member, { id: member.pool.createdById });
      }
    }
  }

  /** Withdraw or disqualify a candidate. Their open work is cancelled, which stops its reminders. */
  async removeMember(poolId, memberId, { decision, reason }, actor) {
    const member = await this._member(poolId, memberId);
    if (member.placedAt) throw new ConflictError('This candidate is already placed in a clan');
    await sequelize.transaction(async (transaction) => {
      await member.update({ decision, decisionReason: reason, decidedById: actor.id, decidedAt: new Date() }, { transaction });
      await this._cancelOpenWork([member.id], actor, reason, transaction);
    });
    await this._audit(actor, 'POOL_MEMBER_REMOVED', member.id, { decision, reason });
    return member;
  }

  // ── Qualification work ─────────────────────────────────────────────────────

  /**
   * Set one piece of work for the whole pool, or for `memberIds`. The work is
   * one shared RoadmapTask with an AssignedTask per candidate, and it joins a
   * scoring component so the ranking can explain where every point came from.
   * Retrying skips anybody who already has it.
   */
  async assignWork(poolId, data, actor) {
    const pool = await this.get(poolId);
    if (['reviewing', 'placing', 'closed'].includes(pool.status)) throw new ValidationError('Work can no longer be assigned in this pool');
    if (!POOL_TASK_TYPES.includes(data.type)) throw new ValidationError('That kind of work cannot be used in a pool');
    if (!(pool.scoringPolicy.components || []).some((c) => c.key === data.componentKey)) {
      throw new ValidationError('Choose a scoring component for this work');
    }

    const kit = await this._kitFor(data);
    const roadmapTask = await models.RoadmapTask.create({
      title: data.title || kit?.title,
      description: data.description || kit?.description || 'No description provided',
      type: data.type,
      difficulty: data.difficulty || 'medium',
      taskOrder: 0,
      deliverable: data.deliverable || 'Complete the assigned work',
      acceptanceCriteria: data.acceptanceCriteria || [],
      estimatedHours: 1,
      isMandatory: true,
      isCustomTask: true,
      pointsBase: 0
    });
    const item = {
      roadmapTaskId: roadmapTask.id,
      dueDate: data.dueDate || null,
      kind: data.type,
      options: data.quiz || data.interview || null
    };
    await this._addToComponent(pool, data.componentKey, item);

    const where = { poolId, decision: null, userId: { [Op.ne]: null } };
    if (Array.isArray(data.memberIds) && data.memberIds.length) where.id = { [Op.in]: data.memberIds };
    const members = await models.PoolMember.findAll({ where });
    let assigned = 0;
    for (const member of members) {
      if (await this._assignItem(pool, member, item, actor)) assigned += 1;
    }
    await this._audit(actor, 'POOL_WORK_ASSIGNED', pool.id, { roadmapTaskId: roadmapTask.id, assigned });
    return { roadmapTaskId: roadmapTask.id, assigned, skippedNoAccount: await models.PoolMember.count({ where: { poolId, userId: null, decision: null } }) };
  }

  /** Submissions waiting on a reviewer, shaped like the mentor approvals queue. */
  async reviewQueue(poolId) {
    const memberIds = (await models.PoolMember.findAll({ where: { poolId }, attributes: ['id'] })).map((m) => m.id);
    if (!memberIds.length) return [];
    return require('./submissionService').getMentorApprovalsQueue(null, {
      taskWhere: { poolMemberId: { [Op.in]: memberIds } }
    });
  }

  // ── Dashboard, scoring and selection ──────────────────────────────────────

  async dashboard(poolId) {
    const pool = await this.get(poolId);
    const members = await this._membersWithWork(poolId);
    const inactivityDays = Number(pool.reminderPolicy?.inactivityDays) || 5;
    const rows = members.map((m) => {
      const tasks = m.tasks || [];
      const score = scoreMember(pool.scoringPolicy, tasks);
      return {
        id: m.id,
        email: m.email,
        name: fullName(m.user),
        userId: m.userId,
        status: m.status,
        bucket: bucketFor(m, tasks, { inactivityDays }),
        decision: m.decision,
        decisionReason: m.decisionReason,
        tasksTotal: tasks.filter((t) => t.status !== 'cancelled').length,
        tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
        components: score.components,
        total: score.total,
        pendingReview: score.pendingReview,
        rank: m.rank,
        placedClan: m.placedClan ? { id: m.placedClan.id, name: m.placedClan.name } : null,
        placedAt: m.placedAt
      };
    });
    const buckets = rows.reduce((acc, r) => ({ ...acc, [r.bucket]: (acc[r.bucket] || 0) + 1 }), {});
    return { pool: this._shape(pool), members: rows, buckets, latestSnapshot: (pool.shortlistSnapshots || []).at(-1) || null };
  }

  /**
   * Score everybody and propose the top `selectionQuota`. Deterministic, and
   * idempotent: the same reviewed work under the same policy version gives
   * the same snapshot, which is then not stored twice.
   */
  async proposeShortlist(poolId, actor) {
    const pool = await this.get(poolId);
    const members = await this._membersWithWork(poolId);
    const scored = members.map((m) => ({ id: m.id, email: m.email, decision: m.decision, ...scoreMember(pool.scoringPolicy, m.tasks || []) }));
    const { ranked, blockers } = rankMembers(scored, pool.selectionQuota);

    const snapshot = {
      policyVersion: pool.scoringPolicy.version || 1,
      quota: pool.selectionQuota,
      entries: ranked.map((r) => ({ memberId: r.id, total: r.total, rank: r.rank, proposed: r.proposed })),
      blockers
    };
    const last = (pool.shortlistSnapshots || []).at(-1);
    const same = last && JSON.stringify({ ...last, generatedAt: undefined, generatedById: undefined }) === JSON.stringify(snapshot);

    await sequelize.transaction(async (transaction) => {
      const byId = new Map(ranked.map((r) => [r.id, r]));
      for (const s of scored) {
        const r = byId.get(s.id);
        await models.PoolMember.update(
          { scoreComponents: s.components, totalScore: s.total, rank: r?.rank ?? null },
          { where: { id: s.id }, transaction }
        );
      }
      if (!same) {
        const snapshots = [...(pool.shortlistSnapshots || []), { ...snapshot, generatedAt: new Date().toISOString(), generatedById: actor.id }];
        await pool.update({ shortlistSnapshots: snapshots.slice(-MAX_SNAPSHOTS), status: pool.status === 'placing' ? pool.status : 'reviewing' }, { transaction });
      }
    });

    if (!same && (blockers.pendingReview.length || blockers.tieAtCutoff.length)) {
      await this._notifyOperators(pool, 'Your selection pool needs a decision',
        `${pool.name}: ${blockers.pendingReview.length} candidate(s) have unreviewed work and ${blockers.tieAtCutoff.length} are tied at the cutoff.`);
    }
    return { ...snapshot, generatedAt: same ? last.generatedAt : new Date().toISOString() };
  }

  /**
   * Confirm the outcome. The latest proposal is the default; `overrides`
   * change it per candidate and each one needs a reason. Unreviewed work or a
   * tie at the cutoff that no override settles stops the whole confirmation.
   */
  async finalizeSelection(poolId, { overrides = [] }, actor) {
    const pool = await this.get(poolId);
    const snapshot = (pool.shortlistSnapshots || []).at(-1);
    if (!snapshot) throw new ValidationError('Propose a shortlist first');
    if (snapshot.policyVersion !== (pool.scoringPolicy.version || 1)) throw new ValidationError('The scoring changed since the last shortlist. Propose it again.');

    const overrideById = new Map(overrides.map((o) => [o.memberId, o]));
    const missingReason = overrides.filter((o) => !String(o.reason || '').trim());
    if (missingReason.length) throw new ValidationError('Every manual change needs a reason');
    if (snapshot.blockers.pendingReview.length) throw new ValidationError('Some candidates still have work waiting for review');
    const unsettledTie = snapshot.blockers.tieAtCutoff.filter((id) => !overrideById.has(id));
    if (unsettledTie.length) throw new ValidationError(`${unsettledTie.length} candidate(s) are tied at the cutoff. Decide each of them.`);

    const members = await models.PoolMember.findAll({ where: { poolId, decision: { [Op.or]: [null, { [Op.in]: FINAL_DECISIONS }] } } });
    const proposedById = new Map(snapshot.entries.map((e) => [e.memberId, e]));
    const decided = [];
    await sequelize.transaction(async (transaction) => {
      for (const member of members) {
        if (member.placedAt) continue; // a placement is never undone here
        const o = overrideById.get(member.id);
        const decision = o?.decision || (proposedById.get(member.id)?.proposed ? 'selected' : 'not_selected');
        if (member.decision === decision && !o) continue;
        await member.update({
          decision,
          decisionReason: o ? o.reason.trim() : null,
          decidedById: actor.id,
          decidedAt: new Date()
        }, { transaction });
        decided.push(member);
      }
      await this._cancelOpenWork(members.map((m) => m.id), actor, 'Selection confirmed', transaction);
      await pool.update({ status: 'placing' }, { transaction });
    });

    await this._audit(actor, 'POOL_SELECTION_CONFIRMED', pool.id, {
      snapshotAt: snapshot.generatedAt,
      overrides: overrides.map((o) => ({ memberId: o.memberId, decision: o.decision, reason: o.reason }))
    });
    await this._notifyOutcomes(pool, decided);
    return this.dashboard(poolId);
  }

  /**
   * Place selected candidates into clans. Each row is its own transaction, so
   * one full clan does not undo the others, and a retry skips anybody already
   * placed. Enrolment and membership go through the existing services.
   */
  async place(poolId, { placements }, actor) {
    const pool = await this.get(poolId);
    if (pool.status !== 'placing') throw new ValidationError('Confirm the selection before placing candidates');
    const clanService = require('./clanService');
    const results = [];

    for (const { memberId, clanId } of placements) {
      const member = await models.PoolMember.findOne({ where: { id: memberId, poolId } });
      if (!member || member.decision !== 'selected') { results.push({ memberId, result: 'not_selected' }); continue; }
      if (member.placedAt) { results.push({ memberId, result: 'already_placed', clanId: member.placedClanId }); continue; }
      try {
        await this._assertClanCanTake(clanId, pool);
        await sequelize.transaction(async (transaction) => {
          const [enrollment] = await models.Enrollment.findOrCreate({
            where: { menteeId: member.userId, programId: pool.programId },
            defaults: { cohortId: pool.cohortId || null, status: 'active', enrolledAt: new Date() },
            transaction
          });
          const already = await models.ClanMembership.findOne({
            where: { clanId, userId: member.userId, role: 'mentee', status: 'active' }, transaction
          });
          if (!already) await clanService.addMember(clanId, { userId: member.userId, role: 'mentee', enrollmentId: enrollment.id }, null, { transaction });
          await member.update({ placedEnrollmentId: enrollment.id, placedClanId: clanId, placedAt: new Date() }, { transaction });
        });
        results.push({ memberId, result: 'placed', clanId });
      } catch (error) {
        results.push({ memberId, result: 'failed', reason: error.message });
        continue;
      }
      await this._notifyPlaced(member, clanId).catch((e) => console.warn('pool placement notify failed:', e.message));
    }

    const failed = results.filter((r) => r.result === 'failed');
    if (failed.length) await this._notifyOperators(pool, 'Some placements failed', `${pool.name}: ${failed.length} candidate(s) could not be placed. Open the pool to retry.`);
    await this._audit(actor, 'POOL_PLACEMENT_RUN', pool.id, { placed: results.filter((r) => r.result === 'placed').length, failed: failed.length });
    return { results };
  }

  // ── Candidate's own view ──────────────────────────────────────────────────

  /** Your qualification work and outcome. Never a rank, score or anybody else. */
  async mine(userId) {
    const members = await models.PoolMember.findAll({
      where: { userId },
      include: [
        { model: models.CandidatePool, as: 'pool', attributes: ['id', 'name', 'description', 'status', 'qualificationDueAt'] },
        {
          model: models.AssignedTask, as: 'tasks', required: false,
          attributes: ['id', 'status', 'dueDate', 'submittedAt', 'completedAt'],
          include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title', 'type'] }]
        },
        { model: models.Clan, as: 'placedClan', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    return members.map((m) => ({
      id: m.id,
      pool: m.pool,
      // A decision is shown only once it is final for the candidate.
      outcome: m.decision,
      placedClan: m.placedClan,
      tasks: (m.tasks || []).filter((t) => t.status !== 'cancelled').map((t) => ({
        id: t.id, title: t.roadmapTask?.title, type: t.roadmapTask?.type, status: t.status, dueDate: t.dueDate
      }))
    }));
  }

  // ── Reminders (scheduler) ─────────────────────────────────────────────────

  /**
   * One pass of candidate reminders, at most one per candidate per day.
   * Only undecided candidates in a pool that is still qualifying are chased,
   * and only about open work, so a submission, a decision, a withdrawal or a
   * closed pool each stops them without anybody having to remember to.
   */
  async sendReminders(now = new Date()) {
    const pools = await models.CandidatePool.findAll({ where: { status: { [Op.in]: ['open', 'qualifying'] } } });
    let sent = 0;
    for (const pool of pools) {
      const policy = pool.reminderPolicy || {};
      if (policy.enabled === false) continue;
      const inviteAfter = (Number(policy.inviteAfterDays) || 3) * DAY_MS;
      const quietAfter = (Number(policy.inactivityDays) || 5) * DAY_MS;
      const members = await this._membersWithWork(pool.id, {
        decision: null,
        [Op.or]: [{ lastRemindedAt: null }, { lastRemindedAt: { [Op.lt]: new Date(now - DAY_MS) } }]
      });
      for (const member of members) {
        const why = this._reminderReason(member, now, inviteAfter, quietAfter);
        if (!why) continue;
        if (why === 'invite') await this._reinvite(pool, member);
        else await this._remind(pool, member, why);
        await member.update({ lastRemindedAt: now });
        sent += 1;
      }
    }
    return sent;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  _reminderReason(member, now, inviteAfter, quietAfter) {
    if (!member.userId) return now - new Date(member.createdAt) > inviteAfter ? 'invite' : null;
    const open = (member.tasks || []).filter((t) => OPEN_STATUSES.includes(t.status));
    if (open.some((t) => t.dueDate && new Date(t.dueDate) > now && new Date(t.dueDate) - now < DAY_MS)) return 'due';
    if (open.some((t) => now - new Date(t.startedAt || t.assignedAt) > quietAfter)) return 'inactive';
    return null;
  }

  async _remind(pool, member, why) {
    const message = why === 'due'
      ? `Some of your ${pool.name} work is due within a day. Submit it to stay in the running.`
      : `You have ${pool.name} work waiting. Pick it up when you can; the selection only counts what you submit.`;
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.POOL_REMINDER,
      recipients: [{ userId: member.userId }],
      payload: {
        title: why === 'due' ? 'Qualification work due soon' : 'Your qualification work is waiting',
        message,
        actionUrl: '/mentee/qualification',
        actionLabel: 'Open my work',
        // Dated, because the orchestrator dedupes on this pair: one reminder a day.
        relatedEntityType: `pool_reminder_${new Date().toISOString().slice(0, 10)}`,
        relatedEntityId: member.id,
        emailSubject: `${pool.name}: ${why === 'due' ? 'work due soon' : 'your work is waiting'}`
      }
    });
  }

  /** A pending invite cannot be resent (only its hash is stored), so it is replaced. */
  async _reinvite(pool, member) {
    if (member.inviteId) await models.RegistrationInvite.update({ revokedAt: new Date() }, { where: { id: member.inviteId, usedAt: null } });
    const { invite, url } = await this._createInvite(pool, member.email, pool.createdById);
    await member.update({ inviteId: invite.id });
    if (url) await notificationOrchestrator.sendRegistrationInviteEmail({ email: member.email, role: 'candidate', inviteUrl: url });
  }

  async _inviteMember(pool, email, actor) {
    return sequelize.transaction(async (transaction) => {
      const { invite, url } = await this._createInvite(pool, email, actor.id, transaction);
      const member = await models.PoolMember.create({ poolId: pool.id, email, inviteId: invite.id, status: 'invited' }, { transaction });
      // A reused invite has already been mailed; its link cannot be rebuilt.
      if (url) {
        transaction.afterCommit(() => notificationOrchestrator
          .sendRegistrationInviteEmail({ email, role: 'candidate', inviteUrl: url })
          .catch((e) => console.warn('pool invite email failed:', e.message)));
      }
      return member;
    });
  }

  /**
   * A mentee invite with no programme or clan: registering makes a restricted
   * account and nothing else. Enrolment only happens at placement. An active
   * invite already out for this email is reused rather than duplicated.
   */
  async _createInvite(pool, email, invitedBy, transaction) {
    const active = await models.RegistrationInvite.findOne({
      where: { email, role: 'mentee', usedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } }, transaction
    });
    if (active && !active.programId) return { invite: active, url: null };
    if (active) throw new ConflictError('This person already has an invite to a programme');
    const rawToken = generateRandomToken();
    const invite = await models.RegistrationInvite.create({
      tokenHash: hashToken(rawToken),
      email,
      role: 'mentee',
      invitedBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS),
      metadata: { poolId: pool.id }
    }, { transaction });
    return { invite, url: inviteLink(rawToken) };
  }

  async _assignConfiguredWork(pool, member, actor) {
    for (const component of pool.scoringPolicy.components || []) {
      for (const item of component.items || []) await this._assignItem(pool, member, item, actor);
    }
  }

  /** One candidate, one piece of work. Returns false when they already have it. */
  async _assignItem(pool, member, item, actor) {
    const exists = await models.AssignedTask.findOne({ where: { poolMemberId: member.id, roadmapTaskId: item.roadmapTaskId }, attributes: ['id'] });
    if (exists) return false;
    const settings = await models.UserSettings.findOne({ where: { userId: member.userId }, attributes: ['timezone'] });
    const due = item.dueDate || pool.qualificationDueAt;
    const task = await models.AssignedTask.create({
      roadmapTaskId: item.roadmapTaskId,
      menteeId: member.userId,
      mentorId: actor.id,
      poolMemberId: member.id,
      enrollmentId: null,
      clanId: null,
      status: 'assigned',
      dueDate: due ? endOfDayInZone(String(due).slice(0, 10), settings?.timezone || 'UTC') : null,
      pointsBase: 0,
      isCustomTask: true
    });
    if (item.kind === 'quiz') await require('./quizKitService').createAssignmentForTask({ assignedTaskId: task.id, kitId: item.options.kitId, options: item.options });
    if (item.kind === 'interview') await require('./interviewKitService').createAssignmentForTask({ assignedTaskId: task.id, kitId: item.options.kitId, options: item.options });
    if (member.status === 'active') await member.update({ status: 'qualifying' });

    const roadmapTask = await models.RoadmapTask.findByPk(item.roadmapTaskId, { attributes: ['title'] });
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
      recipients: [{ userId: member.userId }],
      payload: {
        title: `New qualification work for ${pool.name}`,
        message: `“${roadmapTask?.title || 'New work'}” is ready for you. Open it to get started.`,
        actionUrl: `/mentee/tasks/${task.id}`,
        actionLabel: 'Open task',
        relatedEntityType: 'assigned_task',
        relatedEntityId: task.id,
        emailSubject: `${pool.name}: ${roadmapTask?.title || 'new qualification work'}`
      },
      dedupe: { relatedEntityType: 'task_assigned', relatedEntityId: task.id }
    });
    return true;
  }

  /** Validate a quiz or interview kit up front, so no candidate gets a broken task. */
  async _kitFor(data) {
    const spec = { quiz: ['QuizKit', 'QuizQuestion', data.quiz], interview: ['InterviewKit', 'InterviewQuestion', data.interview] }[data.type];
    if (!spec) return null;
    const [kitModel, questionModel, opts] = spec;
    if (!opts?.kitId) throw new ValidationError(`A ${data.type} needs a kit`);
    const kit = await models[kitModel].findByPk(opts.kitId, { include: [{ model: models[questionModel], as: 'questions', attributes: ['id'] }] });
    if (!kit || !kit.questions?.length) throw new ValidationError(`That ${data.type} has no questions yet`);
    if (kit.status !== 'published') throw new ValidationError(`Publish this ${data.type} before assigning it`);
    return kit;
  }

  async _addToComponent(pool, key, item) {
    const components = [...(pool.scoringPolicy.components || [])];
    const index = components.findIndex((c) => c.key === key);
    const c = components[index];
    components[index] = { ...c, roadmapTaskIds: [...(c.roadmapTaskIds || []), item.roadmapTaskId], items: [...(c.items || []), item] };
    // New work changes what the total is made of: that is a new policy version.
    await pool.update({ scoringPolicy: { version: (pool.scoringPolicy.version || 1) + 1, components } });
  }

  async _cancelOpenWork(memberIds, actor, reason, transaction) {
    if (!memberIds.length) return;
    await models.AssignedTask.update(
      { status: 'cancelled', cancelledBy: actor.id, cancelledAt: new Date(), cancellationReason: reason || null },
      { where: { poolMemberId: { [Op.in]: memberIds }, status: { [Op.in]: OPEN_STATUSES } }, transaction }
    );
  }

  async _assertClanCanTake(clanId, pool) {
    const clan = await models.Clan.findByPk(clanId, { attributes: ['id', 'programId', 'maxMentees', 'leadMentorId', 'frozenAt', 'kind'] });
    if (!clan || clan.programId !== pool.programId) throw new ValidationError('That clan is not in this pool\'s programme');
    if (clan.frozenAt) throw new ValidationError('That clan is closed');
    if (!clan.leadMentorId) throw new ValidationError('That clan has no lead mentor yet');
    if (clan.maxMentees) {
      const taken = await models.ClanMembership.count({ where: { clanId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } } });
      if (taken >= clan.maxMentees) throw new ValidationError('That clan is full');
    }
  }

  async _assertCohortInProgram(cohortId, programId) {
    if (!cohortId) return;
    const cohort = await models.Cohort.findByPk(cohortId, { attributes: ['programId'] });
    if (!cohort || cohort.programId !== programId) throw new ValidationError('That cohort is not in this programme');
  }

  async _membersWithWork(poolId, where = {}) {
    return models.PoolMember.findAll({
      where: { poolId, ...where },
      include: [
        { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: models.Clan, as: 'placedClan', attributes: ['id', 'name'] },
        {
          model: models.AssignedTask, as: 'tasks', required: false,
          attributes: ['id', 'roadmapTaskId', 'status', 'finalRating', 'dueDate', 'assignedAt', 'startedAt', 'submittedAt']
        }
      ],
      order: [['createdAt', 'ASC']]
    });
  }

  async _member(poolId, memberId) {
    const member = await models.PoolMember.findOne({ where: { id: memberId, poolId } });
    if (!member) throw new NotFoundError('Candidate not found in this pool');
    return member;
  }

  async _notifyOutcomes(pool, members) {
    const copy = {
      selected: ['You have been selected', `Congratulations — you were selected from ${pool.name}. You will hear about your clan and mentors shortly.`],
      waitlisted: ['You are on the waitlist', `You are on the waitlist for ${pool.name}. We will let you know if a place opens.`],
      not_selected: ['Your selection result', `Thank you for taking part in ${pool.name}. You were not selected this time.`]
    };
    for (const m of members) {
      if (!m.userId || !copy[m.decision]) continue;
      const [title, message] = copy[m.decision];
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_OUTCOME,
        recipients: [{ userId: m.userId }],
        payload: { title, message, actionUrl: '/mentee/qualification', actionLabel: 'View', relatedEntityType: `pool_outcome_${m.decision}`, relatedEntityId: m.id, emailSubject: `${pool.name}: ${title.toLowerCase()}` }
      });
    }
  }

  /** Only after enrolment and membership exist: the candidate, and the clan's mentor team. */
  async _notifyPlaced(member, clanId) {
    const clan = await models.Clan.findByPk(clanId, { attributes: ['name'] });
    const mentors = await models.ClanMembership.findAll({ where: { clanId, role: ['lead_mentor', 'co_mentor'], status: 'active' }, attributes: ['userId'] });
    const user = await models.User.findByPk(member.userId, { attributes: ['firstName', 'lastName', 'email'] });
    const send = (recipients, title, message, actionUrl) => notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.POOL_PLACED,
      recipients,
      payload: { title, message, actionUrl, relatedEntityType: 'pool_placed', relatedEntityId: member.id, emailSubject: title }
    });
    await send([{ userId: member.userId }], `Welcome to ${clan?.name || 'your clan'}`, 'You have been placed in your clan. Your mentors will be in touch.', '/mentee/dashboard');
    if (mentors.length) {
      await send(mentors.map((m) => ({ userId: m.userId })), 'A selected candidate joined your clan', `${fullName(user)} was placed in ${clan?.name || 'your clan'} from a selection pool.`, '/mentor/mentees');
    }
  }

  async _notifyOperators(pool, title, message) {
    const ids = await authzService.adminUserIdsFor([pool.programId]);
    if (!ids?.length) return;
    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.POOL_ACTION_NEEDED,
      recipients: ids.map((userId) => ({ userId })),
      payload: { title, message, actionUrl: `/admin/pools/${pool.id}`, actionLabel: 'Open pool', relatedEntityType: `pool_action_${new Date().toISOString().slice(0, 10)}`, relatedEntityId: pool.id, emailSubject: title }
    });
  }

  _normalizeComponents(components) {
    const keys = new Set();
    return components.map((c) => {
      const key = String(c.key || c.label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
      if (!key || keys.has(key)) throw new ValidationError('Each scoring component needs its own name');
      keys.add(key);
      return { key, label: String(c.label).trim(), weight: Number(c.weight) || 0, roadmapTaskIds: c.roadmapTaskIds || [], items: c.items || [] };
    });
  }

  _pick(data) {
    return Object.fromEntries(WRITABLE_POOL_FIELDS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
  }

  _shape(pool) {
    const p = pool.toJSON();
    return {
      ...p,
      scoringPolicy: {
        version: p.scoringPolicy.version,
        components: (p.scoringPolicy.components || []).map(({ items, ...c }) => ({ ...c, workCount: (c.roadmapTaskIds || []).length }))
      },
      shortlistSnapshots: undefined
    };
  }

  _audit(actor, action, entityId, newValues) {
    return createAuditLog({ userId: actor.id, action, entityType: 'CandidatePool', entityId, newValues });
  }
}

module.exports = new PoolService();
