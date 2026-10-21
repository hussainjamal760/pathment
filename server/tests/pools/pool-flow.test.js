'use strict';

/**
 * Selection pools, end to end against a real database.
 *
 * Each block is one of the spec's acceptance criteria: retried imports do not
 * duplicate, candidates work without a clan or enrolment, pool work never
 * moves progress or points, a candidate sees only their own outcome, clan
 * mentors cannot mark candidates, unreviewed work and ties stop the selection,
 * and placement is safe to retry.
 */

const { models } = require('../../src/db');
const poolService = require('../../src/services/poolService');
const submissionService = require('../../src/services/submissionService');
const taskService = require('../../src/services/taskService');
const authService = require('../../src/services/authService');
const authzService = require('../../src/services/authzService');
const clanService = require('../../src/services/clanService');
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');
const { PERMISSIONS } = require('../../src/config/permissions');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');

const POOL_TABLES = ['PoolMember', 'CandidatePool'];

async function resetPools() {
  for (const name of POOL_TABLES) await models[name].destroy({ where: {}, force: true });
}

describe('selection pools', () => {
  let admin, lead, maya, sam, program, clan, pool;

  const createPool = (overrides = {}) => poolService.create({
    programId: program.id,
    name: 'Fellowship intake',
    selectionQuota: 1,
    components: [{ label: 'Project', weight: 70 }, { label: 'Quiz', weight: 30 }],
    ...overrides
  }, admin);

  /** Assign a project, have every candidate submit, and return their tasks. */
  async function projectSubmittedBy(...people) {
    await poolService.assignWork(pool.id, { componentKey: 'project', type: 'project', title: 'Build an API' }, admin);
    const tasks = [];
    for (const person of people) {
      const task = await models.AssignedTask.findOne({ where: { menteeId: person.id, poolMemberId: { [require('sequelize').Op.ne]: null } } });
      await submissionService.submitTaskWithFiles(task.id, person.id, { submissionText: 'done' }, []);
      tasks.push(task);
    }
    return tasks;
  }

  const review = async (task, rating, reviewer = admin) => {
    const submission = await models.TaskSubmission.findOne({ where: { assignedTaskId: task.id }, order: [['version', 'DESC']] });
    return submissionService.reviewSubmission(submission.id, reviewer.id, { decision: 'approved', isApproved: true, rating, feedbackText: 'ok' });
  };

  beforeEach(async () => {
    await cleanDb();
    await resetPools();
    jest.clearAllMocks();
    admin = await createAdmin({ email: 'admin@test.com' });
    lead = await createMentor({ email: 'lead@test.com' });
    maya = await createMentee({ email: 'maya@test.com', firstName: 'Maya' });
    sam = await createMentee({ email: 'sam@test.com', firstName: 'Sam' });
    program = await createProgram({ createdBy: admin.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Node Guild', leadMentorId: lead.id, createdBy: admin.id, maxMentees: 1 });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    pool = await models.CandidatePool.findByPk((await createPool()).id);
  });

  describe('import', () => {
    it('adds existing accounts, invites the rest, and never duplicates on retry', async () => {
      const first = await poolService.importMembers(pool.id, { emails: ['MAYA@test.com', 'new@example.com', 'nope', 'maya@test.com'] }, admin);
      expect(first.results.map((r) => r.result)).toEqual(['added', 'invited', 'invalid', 'duplicate_row']);

      const again = await poolService.importMembers(pool.id, { emails: ['maya@test.com', 'new@example.com'] }, admin);
      expect(again.results.map((r) => r.result)).toEqual(['already_in_pool', 'already_in_pool']);
      expect(await models.PoolMember.count({ where: { poolId: pool.id } })).toBe(2);
      expect(await models.RegistrationInvite.count({ where: { email: 'new@example.com' } })).toBe(1);
    });

    it('invites without a programme, so registering creates no enrolment or clan', async () => {
      await poolService.importMembers(pool.id, { emails: ['fresh@example.com'] }, admin);
      const invite = await models.RegistrationInvite.findOne({ where: { email: 'fresh@example.com' } });
      expect(invite.programId).toBeNull();
      expect(invite.metadata.poolId).toBe(pool.id);
    });

    it('respects capacity', async () => {
      await pool.update({ capacity: 1 });
      const { results } = await poolService.importMembers(pool.id, { emails: ['maya@test.com', 'sam@test.com'] }, admin);
      expect(results.map((r) => r.result)).toEqual(['added', 'pool_full']);
    });
  });

  describe('qualification work', () => {
    beforeEach(async () => {
      await poolService.importMembers(pool.id, { emails: ['maya@test.com'] }, admin);
    });

    it('assigns without a clan or enrolment and keeps it off the ordinary task list', async () => {
      const out = await poolService.assignWork(pool.id, { componentKey: 'project', type: 'project', title: 'Build an API' }, admin);
      expect(out.assigned).toBe(1);
      const task = await models.AssignedTask.findOne({ where: { menteeId: maya.id } });
      expect(task.clanId).toBeNull();
      expect(task.enrollmentId).toBeNull();
      expect(task.poolMemberId).toBeTruthy();
      expect(await taskService.getMenteeTasks(maya.id)).toHaveLength(0);
    });

    it('rejects work for a component the pool does not have, without leaving rows behind', async () => {
      const before = await models.RoadmapTask.count();
      await expect(poolService.assignWork(pool.id, { componentKey: 'nope', type: 'project', title: 'x' }, admin)).rejects.toThrow('scoring component');
      expect(await models.RoadmapTask.count()).toBe(before);
    });

    it('earns no points by default, and points when the pool turns them on', async () => {
      const [task] = await projectSubmittedBy(maya);
      await review(task, 5);
      expect((await task.reload()).pointsAwarded).toBe(0);
      expect(await models.PointsHistory.count({ where: { userId: maya.id } })).toBe(0);

      await pool.update({ awardPoints: true });
      await poolService.assignWork(pool.id, { componentKey: 'quiz', type: 'exercise', title: 'Warm-up' }, admin);
      const second = await models.AssignedTask.findOne({ where: { menteeId: maya.id, status: 'assigned' } });
      await submissionService.submitTaskWithFiles(second.id, maya.id, { submissionText: 'done' }, []);
      await review(second, 5);
      expect((await second.reload()).pointsAwarded).toBeGreaterThan(0);
    });

    it('tells the pool, not a mentor, that work came in', async () => {
      await projectSubmittedBy(maya);
      const events = notificationOrchestrator.dispatch.mock.calls.map(([c]) => c.eventKey);
      expect(events).toContain('pool_work_submitted');
      expect(events).not.toContain('task_submitted');
    });

    it('gives work set for a chosen group only to that group', async () => {
      await poolService.importMembers(pool.id, { emails: ['sam@test.com'] }, admin);
      const samMember = await models.PoolMember.findOne({ where: { email: 'sam@test.com' } });
      const out = await poolService.assignWork(pool.id, { componentKey: 'project', type: 'project', title: 'Extra', memberIds: [samMember.id] }, admin);
      expect(out.assigned).toBe(1);
      expect(await models.AssignedTask.count({ where: { menteeId: maya.id } })).toBe(0);
    });
  });

  describe('who may review', () => {
    let task;
    beforeEach(async () => {
      await poolService.importMembers(pool.id, { emails: ['maya@test.com'] }, admin);
      await poolService.assignWork(pool.id, { componentKey: 'project', type: 'project', title: 'Build an API' }, admin);
      task = await models.AssignedTask.findOne({ where: { menteeId: maya.id } });
    });

    it('refuses a clan mentor of the same programme', async () => {
      expect(await authzService.canActOnTask(lead.id, task, PERMISSIONS.TASK_REVIEW)).toBe(false);
    });

    it('admits a pool reviewer of the programme', async () => {
      const reviewer = await createMentor({ email: 'reviewer@test.com' });
      await models.RoleAssignment.create({ userId: reviewer.id, role: 'pool_reviewer', scopeType: 'program', scopeId: program.id, grantedBy: admin.id });
      expect(await authzService.canActOnTask(reviewer.id, task, PERMISSIONS.TASK_REVIEW)).toBe(true);
    });

    it('does not let a pool reviewer review clan work', async () => {
      const reviewer = await createMentor({ email: 'reviewer@test.com' });
      await models.RoleAssignment.create({ userId: reviewer.id, role: 'pool_reviewer', scopeType: 'program', scopeId: program.id, grantedBy: admin.id });
      await clanService.addMember(clan.id, { userId: sam.id, role: 'mentee' });
      const clanTask = await models.AssignedTask.create({ roadmapTaskId: task.roadmapTaskId, menteeId: sam.id, mentorId: lead.id, clanId: clan.id, status: 'submitted' });
      expect(await authzService.canActOnTask(reviewer.id, clanTask, PERMISSIONS.TASK_REVIEW)).toBe(false);
    });
  });

  describe('selection', () => {
    let mayaTask, samTask;
    beforeEach(async () => {
      await poolService.importMembers(pool.id, { emails: ['maya@test.com', 'sam@test.com'] }, admin);
      [mayaTask, samTask] = await projectSubmittedBy(maya, sam);
    });

    it('will not confirm while work waits for review', async () => {
      const snap = await poolService.proposeShortlist(pool.id, admin);
      expect(snap.blockers.pendingReview).toHaveLength(2);
      await expect(poolService.finalizeSelection(pool.id, {}, admin)).rejects.toThrow('waiting for review');
    });

    it('stops at a tie on the cutoff until each tied candidate is decided with a reason', async () => {
      await review(mayaTask, 4);
      await review(samTask, 4);
      const snap = await poolService.proposeShortlist(pool.id, admin);
      expect(snap.blockers.tieAtCutoff).toHaveLength(2);
      await expect(poolService.finalizeSelection(pool.id, {}, admin)).rejects.toThrow('tied');

      const [m, s] = await Promise.all(['maya@test.com', 'sam@test.com'].map((email) => models.PoolMember.findOne({ where: { email } })));
      await expect(poolService.finalizeSelection(pool.id, { overrides: [{ memberId: m.id, decision: 'selected' }] }, admin)).rejects.toThrow('reason');
      await poolService.finalizeSelection(pool.id, { overrides: [
        { memberId: m.id, decision: 'selected', reason: 'Stronger tests' },
        { memberId: s.id, decision: 'waitlisted', reason: 'Tied' }
      ] }, admin);
      expect((await m.reload()).decision).toBe('selected');
      expect((await s.reload()).decision).toBe('waitlisted');
    });

    it('proposes the same shortlist twice without storing it twice', async () => {
      await review(mayaTask, 5);
      await review(samTask, 3);
      await poolService.proposeShortlist(pool.id, admin);
      await poolService.proposeShortlist(pool.id, admin);
      expect((await pool.reload()).shortlistSnapshots).toHaveLength(1);
    });

    describe('placement', () => {
      let mayaMember;
      beforeEach(async () => {
        await review(mayaTask, 5);
        await review(samTask, 3);
        await poolService.proposeShortlist(pool.id, admin);
        await poolService.finalizeSelection(pool.id, {}, admin);
        mayaMember = await models.PoolMember.findOne({ where: { email: 'maya@test.com' } });
      });

      it('creates the enrolment and membership once, however often it is retried', async () => {
        const first = await poolService.place(pool.id, { placements: [{ memberId: mayaMember.id, clanId: clan.id }] }, admin);
        const again = await poolService.place(pool.id, { placements: [{ memberId: mayaMember.id, clanId: clan.id }] }, admin);
        expect(first.results[0].result).toBe('placed');
        expect(again.results[0].result).toBe('already_placed');
        expect(await models.Enrollment.count({ where: { menteeId: maya.id, programId: program.id } })).toBe(1);
        expect(await models.ClanMembership.count({ where: { userId: maya.id, clanId: clan.id, role: 'mentee' } })).toBe(1);
      });

      it('refuses a full clan and keeps the candidate selected but unplaced', async () => {
        await clanService.addMember(clan.id, { userId: (await createMentee({ email: 'other@test.com' })).id, role: 'mentee' });
        const { results } = await poolService.place(pool.id, { placements: [{ memberId: mayaMember.id, clanId: clan.id }] }, admin);
        expect(results[0]).toMatchObject({ result: 'failed', reason: 'That clan is full' });
        expect((await mayaMember.reload()).placedAt).toBeNull();
      });

      it('suggests clans by free seats', async () => {
        const preview = await poolService.placementPreview(pool.id);
        expect(preview.suggestions).toEqual([{ memberId: mayaMember.id, clanId: clan.id }]);
      });

      it('will not select somebody who never made an account', async () => {
        await models.PoolMember.create({ poolId: pool.id, email: 'ghost@example.com', status: 'invited', decision: 'not_selected' });
        const ghost = await models.PoolMember.findOne({ where: { email: 'ghost@example.com' } });
        await expect(poolService.changeDecision(pool.id, ghost.id, { decision: 'selected', reason: 'x' }, admin)).rejects.toThrow('never accepted');
      });

      it('promotes from the waitlist with a reason while placing', async () => {
        const samMember = await models.PoolMember.findOne({ where: { email: 'sam@test.com' } });
        await poolService.changeDecision(pool.id, samMember.id, { decision: 'selected', reason: 'Maya withdrew' }, admin);
        expect((await samMember.reload()).decision).toBe('selected');
        const { events } = await poolService.history(pool.id);
        expect(events.map((e) => e.action)).toContain('POOL_DECISION_CHANGED');
      });
    });
  });

  describe('candidate privacy', () => {
    it('shows a candidate only their own work and outcome, never a score or rank', async () => {
      await poolService.importMembers(pool.id, { emails: ['maya@test.com', 'sam@test.com'] }, admin);
      await poolService.assignWork(pool.id, { componentKey: 'project', type: 'project', title: 'Build an API' }, admin);
      const mine = await poolService.mine(maya.id);
      expect(mine).toHaveLength(1);
      expect(mine[0].tasks).toHaveLength(1);
      expect(JSON.stringify(mine)).not.toMatch(/rank|totalScore|scoreComponents|sam@test/);
    });
  });

  describe('registration', () => {
    it('activates an invited candidate and hands them the work already set', async () => {
      await poolService.importMembers(pool.id, { emails: ['fresh@example.com'] }, admin);
      await poolService.assignWork(pool.id, { componentKey: 'project', type: 'project', title: 'Build an API' }, admin);
      const user = await createMentee({ email: 'fresh@example.com' });
      await poolService.activateForUser(user);
      await poolService.assignConfiguredWorkForUser(user.id);
      const member = await models.PoolMember.findOne({ where: { email: 'fresh@example.com' } });
      expect(member.userId).toBe(user.id);
      expect(await models.AssignedTask.count({ where: { poolMemberId: member.id } })).toBe(1);
      expect(await models.Enrollment.count({ where: { menteeId: user.id } })).toBe(0);
    });
  });

  describe('reminders and dates', () => {
    beforeEach(async () => {
      await pool.update({ status: 'qualifying' });
      await poolService.importMembers(pool.id, { emails: ['maya@test.com'] }, admin);
      await poolService.assignWork(pool.id, { componentKey: 'project', type: 'project', title: 'Build an API', dueDate: '2030-01-10' }, admin);
      jest.clearAllMocks();
    });

    const remindersSent = () => notificationOrchestrator.dispatch.mock.calls.filter(([c]) => c.eventKey === 'pool_reminder').length;

    it('chases a candidate whose work is due within a day, at most once a day', async () => {
      const dayBefore = new Date('2030-01-10T12:00:00Z');
      expect(await poolService.sendReminders(dayBefore)).toBe(1);
      expect(await poolService.sendReminders(dayBefore)).toBe(0);
      expect(remindersSent()).toBe(1);
    });

    it('stops once the candidate is withdrawn', async () => {
      const member = await models.PoolMember.findOne({ where: { email: 'maya@test.com' } });
      await poolService.removeMember(pool.id, member.id, { decision: 'withdrawn', reason: 'Took a job' }, admin);
      expect(await poolService.sendReminders(new Date('2030-01-10T12:00:00Z'))).toBe(0);
    });

    it('moves the pool to reviewing when the qualification deadline passes', async () => {
      await pool.update({ qualificationDueAt: new Date('2030-01-01T00:00:00Z') });
      await poolService.followSchedule(new Date('2030-01-02T00:00:00Z'));
      expect((await pool.reload()).status).toBe('reviewing');
      expect(await poolService.sendReminders(new Date('2030-01-10T12:00:00Z'))).toBe(0);
    });
  });
});
