const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { endOfDayInZone } = require('../utils/timezone');
const authzService = require('./authzService');
const taskService = require('./taskService');
const { pointsForDifficulty } = require('../config/points');


const ACTIVE_ENROLLMENT_STATUSES = ['active', 'matched', 'approved', 'pending_completion', 'level_completed'];

const OVERRIDE_FIELDS = ['titleOverride', 'descriptionOverride', 'deliverableOverride', 'acceptanceCriteriaOverride', 'resourcesOverride', 'mentorNote'];

function sanitizeOverride(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let any = false;
  for (const f of OVERRIDE_FIELDS) {
    if (f in raw) {
      const v = raw[f];
      const val = (v === '' || v == null || (Array.isArray(v) && !v.length)) ? null : v;
      out[f] = val;
      if (val != null) any = true;
    }
  }
  return any ? out : null;
}

class LinearRoadmapService {
  async generateSteps(input = {}, userId = null) {
    const groqService = require('./groqService');

    const mode = input.mode === 'weeks' ? 'weeks' : 'tasks';
    const weeks = mode === 'weeks'
      ? Math.max(1, Math.min(52, Number(input.durationWeeks) || 6))
      : null;

    let count = Number(input.count ?? input.stepCount);
    if (!Number.isFinite(count) || count <= 0) count = weeks ? weeks * 3 : 8;
    count = Math.max(1, Math.min(40, Math.round(count)));

    return groqService.generateRoadmapSteps({
      feature: 'roadmap',
      userId,
      name: input.name || input.programName || 'Roadmap',
      description: input.description || '',
      tags: Array.isArray(input.skillTags) ? input.skillTags.join(', ') : (input.tags || ''),
      instructions: input.additionalInstructions || input.instructions || input.prompt || '',
      weeks,
      count,
    });
  }

  async getSteps(roadmapId) {
    return models.RoadmapTask.findAll({
      where: { roadmapId },
      order: [['taskOrder', 'ASC']],
      attributes: ['id', 'title', 'description', 'type', 'difficulty', 'taskOrder', 'deliverable', 'acceptanceCriteria', 'estimatedHours', 'pointsBase', 'effort', 'dueOffsetDays'],
      include: [{
        model: models.TaskResource, as: 'resources',
        attributes: ['id', 'title', 'url', 'resourceType', 'description', 'displayOrder'],
        separate: true, order: [['displayOrder', 'ASC']],
      }],
    });
  }

  async withSteps(roadmap) {
    const steps = await this.getSteps(roadmap.id);
    const json = roadmap.toJSON ? roadmap.toJSON() : roadmap;
    return { ...json, steps };
  }

  async _clanTeamMentorIds(mentorId) {
    const ids = new Set([mentorId]);
    const clanIds = await authzService.mentoredClanIds(mentorId);
    if (clanIds.length) {
      const teammates = await models.ClanMembership.findAll({
        where: {
          clanId: { [Op.in]: clanIds },
          status: 'active',
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] }
        },
        attributes: ['userId']
      });
      teammates.forEach((t) => t.userId && ids.add(t.userId));
    }
    return [...ids];
  }

  async listForMentor(mentorId) {
    const ownerIds = await this._clanTeamMentorIds(mentorId);
    const [local, org] = await Promise.all([
      models.Roadmap.findAll({ where: { source: 'local', ownerMentorId: { [Op.in]: ownerIds } }, order: [['created_at', 'DESC']] }),
      models.Roadmap.findAll({ where: { source: 'org', published: true }, order: [['created_at', 'DESC']] })
    ]);
    const [localWithSteps, orgWithSteps] = await Promise.all([
      Promise.all(local.map(async (r) => ({ ...(await this.withSteps(r)), isOwner: r.ownerMentorId === mentorId }))),
      Promise.all(org.map((r) => this.withSteps(r)))
    ]);
    return { local: localWithSteps, org: orgWithSteps };
  }

  async getRoadmap(roadmapId) {
    const roadmap = await models.Roadmap.findByPk(roadmapId);
    if (!roadmap) throw new NotFoundError('Roadmap not found');
    return this.withSteps(roadmap);
  }

  _assertName(name) {
    const n = String(name || '').trim();
    if (!n) throw new ValidationError('A roadmap name is required');
    if (n.length > 255) throw new ValidationError(`Roadmap name is too long (${n.length}/255 characters)`);
  }

  _assertSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) throw new ValidationError('At least one step is required');
    if (steps.length > 100) throw new ValidationError('A roadmap can have at most 100 steps');
    steps.forEach((s, i) => {
      const title = String(s?.title || '').trim();
      if (!title) throw new ValidationError(`Step ${i + 1} needs a title`);
      if (title.length > 255) {
        throw new ValidationError(`Step ${i + 1}: the title is too long (${title.length}/255 characters). Put the details in the step description instead.`);
      }
      if (s.description != null && String(s.description).length > 20000) {
        throw new ValidationError(`Step ${i + 1}: the description is too long (max 20000 characters)`);
      }
    });
  }

  _cleanDescription(html) {
    const v = String(html || '').replace(/<p>\s*<\/p>/gi, '').trim();
    return v || null;
  }

  _stepToTask(step, roadmapId, order) {
    const title = String(step.title || '').trim().slice(0, 255);
    const desc = this._cleanDescription(step.description);
    return {
      roadmapId,
      title,
      description: desc || step.brief || 'No description provided',
      type: step.type || 'project',
      difficulty: step.difficulty || 'medium',
      taskOrder: order,
      deliverable: step.deliverable || title,
      acceptanceCriteria: Array.isArray(step.criteria) ? step.criteria : (step.acceptanceCriteria || []),
      estimatedHours: step.estimatedHours || null,
      effort: ['xs', 's', 'm', 'l', 'xl'].includes(step.effort) ? step.effort : null,
      dueOffsetDays: Number.isFinite(Number(step.dueOffsetDays)) && step.dueOffsetDays !== null && step.dueOffsetDays !== '' ? Number(step.dueOffsetDays) : null,
      isMandatory: true,
      isCustomTask: false,
      pointsBase: pointsForDifficulty(step.difficulty)
    };
  }

  _inferResourceType(url) {
    const u = String(url || '').toLowerCase();
    if (/youtube\.com|youtu\.be/.test(u)) return 'video';
    if (/docs\.google|drive\.google/.test(u)) return 'document';
    if (/github\.com/.test(u)) return 'repo';
    if (/freecodecamp|udemy|coursera|edx|scrimba|course/.test(u)) return 'course';
    return 'link';
  }

  _normalizeResources(resources) {
    if (!Array.isArray(resources)) return [];
    return resources.map((r, i) => {
      const url = String(r?.url || '').trim();
      if (!url) return null;
      const title = (String(r?.title || r?.label || '').trim() || url).slice(0, 255);
      return {
        title,
        url,
        resourceType: (r?.resourceType ? String(r.resourceType).slice(0, 50) : this._inferResourceType(url)),
        description: r?.description ? String(r.description) : null,
        displayOrder: i,
      };
    }).filter(Boolean).slice(0, 40);
  }

  async _syncTaskResources(taskId, resources, transaction = null) {
    const rows = this._normalizeResources(resources);
    await models.TaskResource.destroy({ where: { roadmapTaskId: taskId }, transaction });
    if (rows.length) {
      await models.TaskResource.bulkCreate(rows.map((r) => ({ ...r, roadmapTaskId: taskId })), { transaction });
    }
  }

  async createRoadmap(mentorId, data) {
    const { name, programId, description, skillTags, steps } = data;
    if (!programId) throw new ValidationError('A program is required');
    this._assertName(name);
    this._assertSteps(steps);

    return sequelize.transaction(async (transaction) => {
      const roadmap = await models.Roadmap.create({
        programId,
        name,
        description: description || null,
        source: 'local',
        published: false,
        ownerMentorId: mentorId,
        skillTags: Array.isArray(skillTags) ? skillTags : [],
        isBaseRoadmap: false,
        totalTasks: steps.length
      }, { transaction });

      const tasks = await models.RoadmapTask.bulkCreate(
        steps.map((s, i) => this._stepToTask(s, roadmap.id, i)),
        { transaction }
      );
      for (let i = 0; i < tasks.length; i++) await this._syncTaskResources(tasks[i].id, steps[i].resources, transaction);

      return roadmap;
    }).then((roadmap) => this.getRoadmap(roadmap.id));
  }

  async _assertOwnedLocal(roadmapId, mentorId) {
    const roadmap = await models.Roadmap.findByPk(roadmapId);
    if (!roadmap) throw new NotFoundError('Roadmap not found');
    if (roadmap.source !== 'local' || roadmap.ownerMentorId !== mentorId) {
      throw new ForbiddenError('You can only edit your own roadmaps');
    }
    return roadmap;
  }

  async updateRoadmapMeta(mentorId, roadmapId, updates) {
    const roadmap = await this._assertOwnedLocal(roadmapId, mentorId);
    if (updates.name !== undefined) this._assertName(updates.name);
    ['name', 'description', 'skillTags'].forEach((k) => {
      if (updates[k] !== undefined) roadmap[k] = updates[k];
    });
    await roadmap.save();
    return this.getRoadmap(roadmapId);
  }

  async addStep(mentorId, roadmapId, step) {
    await this._assertOwnedLocal(roadmapId, mentorId);
    this._assertSteps([step]);
    const max = await models.RoadmapTask.max('taskOrder', { where: { roadmapId } });
    const order = (Number.isFinite(max) ? max : -1) + 1;
    const created = await models.RoadmapTask.create(this._stepToTask(step, roadmapId, order));
    await this._syncTaskResources(created.id, step.resources);
    return this.getRoadmap(roadmapId);
  }

  async removeStep(mentorId, roadmapId, stepId) {
    await this._assertOwnedLocal(roadmapId, mentorId);
    const assignedCount = await models.AssignedTask.count({ where: { roadmapTaskId: stepId } });
    if (assignedCount > 0) {
      throw new ValidationError('This step has already been assigned to a mentee and cannot be removed');
    }
    await models.RoadmapTask.destroy({ where: { id: stepId, roadmapId } });
    return this.getRoadmap(roadmapId);
  }

  async replaceSteps(mentorId, roadmapId, steps) {
    await this._assertOwnedLocal(roadmapId, mentorId);
    this._assertSteps(steps);

    const existing = await models.RoadmapTask.findAll({ where: { roadmapId } });
    const byId = new Map(existing.map((t) => [t.id, t]));
    const keep = new Set(steps.filter((s) => s.id && byId.has(s.id)).map((s) => s.id));
    const toDelete = existing.filter((t) => !keep.has(t.id));
    for (const t of toDelete) {
      const assigned = await models.AssignedTask.count({ where: { roadmapTaskId: t.id } });
      if (assigned > 0) throw new ValidationError(`"${t.title}" is already assigned to a mentee and can't be removed`);
    }

    return sequelize.transaction(async (transaction) => {
      if (toDelete.length) await models.RoadmapTask.destroy({ where: { id: toDelete.map((t) => t.id) }, transaction });
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const fields = this._stepToTask(s, roadmapId, i);
        let taskId;
        if (s.id && byId.has(s.id)) { await byId.get(s.id).update(fields, { transaction }); taskId = s.id; }
        else { const created = await models.RoadmapTask.create(fields, { transaction }); taskId = created.id; }
        await this._syncTaskResources(taskId, s.resources, transaction);
      }
      await models.Roadmap.update({ totalTasks: steps.length }, { where: { id: roadmapId }, transaction });
    }).then(() => this.getRoadmap(roadmapId));
  }

  async importOrgRoadmap(mentorId, orgRoadmapId) {
    const org = await models.Roadmap.findByPk(orgRoadmapId);
    if (!org || org.source !== 'org') throw new NotFoundError('Org roadmap not found');
    const steps = await this.getSteps(orgRoadmapId);

    return sequelize.transaction(async (transaction) => {
      const copy = await models.Roadmap.create({
        programId: org.programId,
        name: org.name,
        description: org.description,
        source: 'local',
        published: false,
        importedFrom: org.id,
        ownerMentorId: mentorId,
        skillTags: org.skillTags || [],
        isBaseRoadmap: false,
        totalTasks: steps.length
      }, { transaction });

      const tasks = await models.RoadmapTask.bulkCreate(
        steps.map((s, i) => this._stepToTask(s, copy.id, i)),
        { transaction }
      );
      for (let i = 0; i < tasks.length; i++) await this._syncTaskResources(tasks[i].id, steps[i].resources, transaction);

      return copy;
    }).then((copy) => this.getRoadmap(copy.id));
  }

  async listOrgRoadmaps(filter = {}) {
    const roadmaps = await models.Roadmap.findAll({
      where: { source: 'org', ...filter },
      order: [['created_at', 'DESC']]
    });
    return Promise.all(roadmaps.map((r) => this.withSteps(r)));
  }

  async createOrgRoadmap(adminId, data) {
    const { name, programId, description, skillTags, steps, published } = data;
    if (!programId) throw new ValidationError('A program is required');
    this._assertName(name);
    this._assertSteps(steps);

    return sequelize.transaction(async (transaction) => {
      const roadmap = await models.Roadmap.create({
        programId,
        name,
        description: description || null,
        source: 'org',
        published: published !== false,
        ownerMentorId: null,
        skillTags: Array.isArray(skillTags) ? skillTags : [],
        isBaseRoadmap: false,
        totalTasks: steps.length
      }, { transaction });

      const tasks = await models.RoadmapTask.bulkCreate(
        steps.map((s, i) => this._stepToTask(s, roadmap.id, i)),
        { transaction }
      );
      for (let i = 0; i < tasks.length; i++) await this._syncTaskResources(tasks[i].id, steps[i].resources, transaction);
      return roadmap;
    }).then((roadmap) => this.getRoadmap(roadmap.id));
  }

  async _assertOrg(roadmapId) {
    const roadmap = await models.Roadmap.findByPk(roadmapId);
    if (!roadmap) throw new NotFoundError('Roadmap not found');
    if (roadmap.source !== 'org') throw new ForbiddenError('Not an org roadmap');
    return roadmap;
  }

  async updateOrgMeta(roadmapId, updates) {
    const roadmap = await this._assertOrg(roadmapId);
    if (updates.name !== undefined) this._assertName(updates.name);
    ['name', 'description', 'skillTags', 'published'].forEach((k) => {
      if (updates[k] !== undefined) roadmap[k] = updates[k];
    });
    await roadmap.save();
    return this.getRoadmap(roadmapId);
  }

  async addOrgStep(roadmapId, step) {
    await this._assertOrg(roadmapId);
    this._assertSteps([step]);
    const max = await models.RoadmapTask.max('taskOrder', { where: { roadmapId } });
    const order = (Number.isFinite(max) ? max : -1) + 1;
    const created = await models.RoadmapTask.create(this._stepToTask(step, roadmapId, order));
    await this._syncTaskResources(created.id, step.resources);
    return this.getRoadmap(roadmapId);
  }

  async removeOrgStep(roadmapId, stepId) {
    await this._assertOrg(roadmapId);
    await models.RoadmapTask.destroy({ where: { id: stepId, roadmapId } });
    return this.getRoadmap(roadmapId);
  }

  async replaceOrgSteps(roadmapId, steps) {
    await this._assertOrg(roadmapId);
    this._assertSteps(steps);

    const existing = await models.RoadmapTask.findAll({ where: { roadmapId } });
    const byId = new Map(existing.map((t) => [t.id, t]));
    const keep = new Set(steps.filter((s) => s.id && byId.has(s.id)).map((s) => s.id));
    const toDelete = existing.filter((t) => !keep.has(t.id));

    return sequelize.transaction(async (transaction) => {
      if (toDelete.length) await models.RoadmapTask.destroy({ where: { id: toDelete.map((t) => t.id) }, transaction });
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const fields = this._stepToTask(s, roadmapId, i);
        let taskId;
        if (s.id && byId.has(s.id)) { await byId.get(s.id).update(fields, { transaction }); taskId = s.id; }
        else { const created = await models.RoadmapTask.create(fields, { transaction }); taskId = created.id; }
        await this._syncTaskResources(taskId, s.resources, transaction);
      }
      await models.Roadmap.update({ totalTasks: steps.length }, { where: { id: roadmapId }, transaction });
    }).then(() => this.getRoadmap(roadmapId));
  }

  async deleteOrgRoadmap(roadmapId) {
    await this._assertOrg(roadmapId);
    await models.RoadmapTask.destroy({ where: { roadmapId } });
    await models.Roadmap.destroy({ where: { id: roadmapId } });
    return { deleted: true };
  }

  async getMenteeRoadmaps(menteeId) {
    const progresses = await models.RoadmapProgress.findAll({ where: { menteeId }, order: [['created_at', 'DESC']] });
    const out = [];
    for (const p of progresses) {
      const roadmap = await models.Roadmap.findByPk(p.roadmapId, { attributes: ['id', 'name', 'description', 'skillTags'] });
      if (!roadmap) continue;

      const templateSteps = await this.getSteps(p.roadmapId);
      const templateStepIds = templateSteps.map((s) => s.id);

      const assignedTasks = p.enrollmentId
        ? await models.AssignedTask.findAll({
            where: {
              menteeId,
              enrollmentId: p.enrollmentId,
              status: { [Op.ne]: 'cancelled' },
            },
            attributes: ['id', 'roadmapTaskId', 'status', 'dueDate', 'completedAt', 'pointsAwarded', 'pointsBase', 'isCustomTask', 'assignedAt', 'titleOverride', 'descriptionOverride', 'deliverableOverride', 'acceptanceCriteriaOverride', 'resourcesOverride'],
            include: [{
              model: models.RoadmapTask,
              as: 'roadmapTask',
              attributes: ['id', 'title', 'description', 'type', 'difficulty', 'deliverable', 'acceptanceCriteria', 'estimatedHours', 'pointsBase', 'effort', 'dueOffsetDays'],
              include: [{
                model: models.TaskResource, as: 'resources',
                attributes: ['id', 'title', 'url', 'resourceType', 'description', 'displayOrder'],
                separate: true, order: [['displayOrder', 'ASC']],
              }],
            }],
          })
        : [];

      const roadmapAssignments = assignedTasks.filter(at => !at.isCustomTask && templateStepIds.includes(at.roadmapTaskId));
      const customAssignments = assignedTasks.filter(at => at.isCustomTask);

      const assignedByStepId = new Map(roadmapAssignments.map(at => [at.roadmapTaskId, at]));

      const allActiveTasks = [
        ...templateSteps
          .filter(s => assignedByStepId.has(s.id))
          .map(s => {
            const at = assignedByStepId.get(s.id);
            return { type: 'roadmap', step: s, assignedAt: at.assignedAt, assignedTask: at };
          }),
        ...customAssignments
          .filter(at => at.roadmapTask)
          .map(at => ({ type: 'custom', step: at.roadmapTask, assignedAt: at.assignedAt, assignedTask: at }))
      ];

      allActiveTasks.sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt) || a.assignedTask.id.localeCompare(b.assignedTask.id));

      const lockedRoadmapSteps = templateSteps.filter(s => !assignedByStepId.has(s.id));

      const finalSteps = [];
      let earnedRoadmapPoints = 0;
      let totalRoadmapPoints = 0;
      let completedCount = 0;

      for (const item of allActiveTasks) {
        const s = item.step;
        const at = item.assignedTask;
        const done = at.status === 'completed';
        const isCurrent = !p.completed && at.status !== 'completed';
        const status = done ? 'completed' : 'current';

        const basePts = at.pointsBase ?? s.pointsBase ?? 0;
        totalRoadmapPoints += basePts;
        if (done) {
          earnedRoadmapPoints += at.pointsAwarded ?? basePts;
          completedCount++;
        }

        finalSteps.push({
          id: s.id,
          title: at.titleOverride || s.title,
          description: at.descriptionOverride || s.description || '',
          type: s.type || 'assignment',
          difficulty: s.difficulty || 'medium',
          effort: s.effort || 'm',
          deliverable: at.deliverableOverride || s.deliverable || '',
          acceptanceCriteria: at.acceptanceCriteriaOverride || s.acceptanceCriteria || [],
          estimatedHours: s.estimatedHours ?? null,
          pointsBase: basePts,
          dueOffsetDays: s.dueOffsetDays ?? null,
          resources: at.resourcesOverride || s.resources || [],
          done,
          current: isCurrent,
          status,
          assignedTask: {
            id: at.id,
            status: at.status,
            dueDate: at.dueDate,
            completedAt: at.completedAt,
            pointsAwarded: at.pointsAwarded,
          }
        });
      }

      for (const s of lockedRoadmapSteps) {
        const basePts = s.pointsBase ?? 0;
        totalRoadmapPoints += basePts;

        finalSteps.push({
          id: s.id,
          title: s.title,
          description: s.description || '',
          type: s.type || 'assignment',
          difficulty: s.difficulty || 'medium',
          effort: s.effort || 'm',
          deliverable: s.deliverable || '',
          acceptanceCriteria: s.acceptanceCriteria || [],
          estimatedHours: s.estimatedHours ?? null,
          pointsBase: basePts,
          dueOffsetDays: s.dueOffsetDays ?? null,
          resources: s.resources || [],
          done: false,
          current: false,
          status: 'upcoming',
          assignedTask: null
        });
      }

      const total = finalSteps.length;
      let currentStep = p.completed ? total : finalSteps.findIndex((s) => !s.done);
      if (currentStep === -1) currentStep = total;

      const activeAssignedTask = assignedTasks.find((at) => ['assigned', 'in_progress', 'submitted', 'revision_needed'].includes(at.status));
      const nextMilestoneDueDate = activeAssignedTask?.dueDate || null;

      let mentorCheckInDate = null;
      const nextMeeting = await models.ScheduledMeeting.findOne({
        where: {
          menteeId,
          status: 'scheduled',
          startsAt: { [Op.gte]: new Date() },
        },
        order: [['starts_at', 'ASC']],
      });

      if (nextMeeting?.startsAt) {
        mentorCheckInDate = new Date(nextMeeting.startsAt).toISOString();
      }

      if (!mentorCheckInDate && models.CohortReviewSession) {
        const clanMember = models.ClanMembership
          ? await models.ClanMembership.findOne({ where: { userId: menteeId, status: 'active' } })
          : null;
        const clanId = clanMember?.clanId || null;

        const sessionWhere = clanId
          ? { clanId, [Op.or]: [{ status: 'in_progress' }, { scheduledAt: { [Op.gte]: new Date() } }] }
          : { [Op.or]: [{ status: 'in_progress' }, { scheduledAt: { [Op.gte]: new Date() } }] };

        const nextCohortSession = await models.CohortReviewSession.findOne({
          where: sessionWhere,
          order: [['scheduled_at', 'ASC']],
        });
        if (nextCohortSession?.scheduledAt) {
          mentorCheckInDate = new Date(nextCohortSession.scheduledAt).toISOString();
        }
      }

      out.push({
        roadmapId: roadmap.id,
        name: roadmap.name,
        description: roadmap.description,
        skillTags: roadmap.skillTags || [],
        currentStep,
        totalSteps: total,
        completed: !!p.completed,
        percent: total > 0 ? Math.round((completedCount / total) * 100) : 0,
        currentStepTitle: !p.completed && finalSteps[currentStep] ? finalSteps[currentStep].title : (p.completed ? 'Roadmap Completed 🎉' : null),
        nextMilestoneDueDate,
        mentorCheckInDate,
        earnedRoadmapPoints,
        totalRoadmapPoints,
        steps: finalSteps,
      });
    }
    return out;
  }

  async _activeEnrollment(menteeId) {
    const enrollments = await models.Enrollment.findAll({ where: { menteeId } });
    return enrollments.find((e) => ACTIVE_ENROLLMENT_STATUSES.includes(e.status))
      || [...enrollments].sort((a, b) => new Date(b.enrolledAt || 0) - new Date(a.enrolledAt || 0))[0]
      || null;
  }

  async _assignStep(step, menteeId, mentorId, enrollmentId, dueOverride = null, override = null) {
    const ov = sanitizeOverride(override);
    const existing = await models.AssignedTask.findOne({ where: { roadmapTaskId: step.id, menteeId } });
    if (existing) {
      if (existing.status === 'cancelled') {
        existing.status = 'assigned';
        existing.cancelledBy = null;
        existing.cancelledAt = null;
        existing.cancellationReason = null;
        existing.assignedAt = new Date();
        existing.startedAt = null;
        existing.submittedAt = null;
        existing.completedAt = null;
        if (dueOverride) { const d = new Date(dueOverride); if (!Number.isNaN(d.getTime())) existing.dueDate = d; }
        if (ov) for (const [k, v] of Object.entries(ov)) existing[k] = v;
        await existing.save();
      }
      return existing;
    }
    let due = null;
    if (dueOverride) {
      const d = new Date(dueOverride);
      if (!Number.isNaN(d.getTime())) due = d;
    }
    if (!due) {
      due = new Date();
      const offset = Number.isFinite(Number(step.dueOffsetDays)) && step.dueOffsetDays != null ? Number(step.dueOffsetDays) : 7;
      due.setDate(due.getDate() + offset);
    }
    const assigned = await models.AssignedTask.create({
      roadmapTaskId: step.id,
      menteeId,
      mentorId,
      enrollmentId,
      status: 'assigned',
      assignedAt: new Date(),
      dueDate: due,
      isCustomTask: false,
      pointsBase: pointsForDifficulty(step.difficulty),
      ...(ov || {})
    });

    const mentorUser = await models.User.findByPk(mentorId, { attributes: ['firstName', 'lastName'] });
    const mentorFirst = mentorUser?.firstName || 'Your mentor';
    const stepTitle = step.title || 'a new step';
    const dueTzSettings = await models.UserSettings.findOne({ where: { userId: menteeId }, attributes: ['timezone'] });
    const dueStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: dueTzSettings?.timezone || 'UTC' });
    notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
      recipients: [{ userId: menteeId }],
      payload: {
        title: `${mentorFirst} added a roadmap step`,
        message: `“${stepTitle}” is your next step · due ${dueStr}. Open it to get started.`,
        actionUrl: `/mentee/tasks/${assigned.id}`,
        actionLabel: 'Open task',
        relatedEntityType: 'assigned_task',
        relatedEntityId: assigned.id,
        emailSubject: `New roadmap step: ${stepTitle}`
      },
      dedupe: { relatedEntityType: 'task_assigned', relatedEntityId: assigned.id }
    }).catch((e) => console.error('[Roadmap] assign notification failed:', e.message));

    return assigned;
  }

  async getAssignees(roadmapId) {
    const roadmap = await models.Roadmap.findByPk(roadmapId, { attributes: ['id', 'importedFrom'] });
    const lineageRoot = (roadmap && roadmap.importedFrom) || roadmapId;
    const siblings = await models.Roadmap.findAll({
      where: { [Op.or]: [{ id: lineageRoot }, { importedFrom: lineageRoot }] },
      attributes: ['id'],
    });
    const siblingIds = siblings.map((s) => s.id);
    if (!siblingIds.includes(roadmapId)) siblingIds.push(roadmapId);
    const rows = await models.RoadmapProgress.findAll({ where: { roadmapId: { [Op.in]: siblingIds } }, attributes: ['menteeId'] });
    return [...new Set(rows.map((r) => r.menteeId))];
  }

  async assignToMentee(mentorId, roadmapId, menteeId, startStep = 0, slot = null, dueDate = null, stepIndexes = null, stepOverrides = null) {
    const roadmap = await models.Roadmap.findByPk(roadmapId);
    const steps = await this.getSteps(roadmapId);
    if (!steps.length) throw new ValidationError('This roadmap has no steps to assign');

    let indexes;
    if (Array.isArray(stepIndexes) && stepIndexes.length) {
      indexes = [...new Set(stepIndexes.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < steps.length))].sort((a, b) => a - b);
    }
    if (!indexes || !indexes.length) indexes = [Math.max(0, Math.min(startStep, steps.length - 1))];
    const idx = indexes[0]; 

    let resolvedDue = null;
    if (dueDate) {
      const raw = String(dueDate);
      const dateOnly = raw.split('T')[0];
      if (!raw.includes('T') && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
        const s = await models.UserSettings.findOne({ where: { userId: menteeId }, attributes: ['timezone'] });
        resolvedDue = endOfDayInZone(dateOnly, s?.timezone || 'UTC') || new Date(raw);
      } else {
        resolvedDue = new Date(raw);
      }
    }

    let enrollment = await this._activeEnrollment(menteeId);
    if (!enrollment) {
      if (!roadmap?.programId) throw new ValidationError('Mentee has no enrollment to attach this work to');
      enrollment = await models.Enrollment.create({
        menteeId, programId: roadmap.programId, status: 'active', enrolledAt: new Date()
      });
    }

    return sequelize.transaction(async (transaction) => {
      let progress = await models.RoadmapProgress.findOne({ where: { roadmapId, menteeId }, transaction });
      if (progress) {
        progress.currentStep = Math.min(progress.currentStep ?? idx, idx);
        progress.completed = false;
        progress.enrollmentId = enrollment.id;
        if (slot) progress.slot = slot;
        await progress.save({ transaction });
      } else {
        progress = await models.RoadmapProgress.create({
          roadmapId, menteeId, enrollmentId: enrollment.id, currentStep: idx, completed: false, slot: slot || null
        }, { transaction });
      }
      return progress;
    }).then(async (progress) => {
      const overridesById = stepOverrides && typeof stepOverrides === 'object' ? stepOverrides : null;
      for (const i of indexes) {
        const ov = overridesById ? overridesById[steps[i].id] : null;
        await this._assignStep(steps[i], menteeId, mentorId, enrollment.id, resolvedDue, ov);
      }
      await taskService.updateEnrollmentTaskStats(enrollment.id).catch(e => console.error('[Roadmap] progress update failed:', e.message));
      return progress;
    });
  }

  async getMenteeStepStatus(roadmapId, menteeId) {
    const steps = await this.getSteps(roadmapId);
    const roadmap = await models.Roadmap.findByPk(roadmapId, { attributes: ['id', 'importedFrom'] });

    const lineageRoot = (roadmap && roadmap.importedFrom) || roadmapId;
    const siblings = await models.Roadmap.findAll({
      where: { [Op.or]: [{ id: lineageRoot }, { importedFrom: lineageRoot }] },
      attributes: ['id'],
    });
    const siblingIds = siblings.map((s) => s.id);
    if (!siblingIds.includes(roadmapId)) siblingIds.push(roadmapId);

    const norm = (t) => String(t || '').trim().toLowerCase();

    const lineageSteps = await models.RoadmapTask.findAll({
      where: { roadmapId: { [Op.in]: siblingIds } },
      attributes: ['id', 'title'],
    });
    const titleByTaskId = new Map(lineageSteps.map((t) => [t.id, norm(t.title)]));
    const lineageTaskIds = [...titleByTaskId.keys()];

    const assigned = lineageTaskIds.length
      ? await models.AssignedTask.findAll({
        where: { roadmapTaskId: { [Op.in]: lineageTaskIds }, menteeId, status: { [Op.ne]: 'cancelled' } },
        attributes: ['roadmapTaskId', 'status'],
      })
      : [];

    const RANK = { assigned: 1, not_started: 1, in_progress: 2, revision_needed: 2, submitted: 3, completed: 4 };
    const statusByTitle = new Map();
    assigned.forEach((a) => {
      const title = titleByTaskId.get(a.roadmapTaskId);
      if (!title) return;
      const cur = statusByTitle.get(title);
      if (!cur || (RANK[a.status] || 0) > (RANK[cur] || 0)) statusByTitle.set(title, a.status);
    });

    const ACTIVE = ['assigned', 'not_started', 'in_progress', 'revision_needed', 'submitted'];
    const steps2 = steps.map((s, i) => ({ index: i, stepId: s.id, title: s.title, type: s.type, status: statusByTitle.get(norm(s.title)) || null }));
    return {
      steps: steps2,
      activeCount: steps2.filter((s) => s.status && ACTIVE.includes(s.status)).length,
      assignedCount: steps2.filter((s) => s.status).length,
    };
  }

  async getNextLinks(roadmapId) {
    const links = await models.RoadmapLink.findAll({
      where: { fromRoadmapId: roadmapId },
      order: [['position', 'ASC']],
      include: [{ model: models.Roadmap, as: 'toRoadmap', attributes: ['id', 'name'] }],
    });
    return links.map((l) => ({ id: l.id, toRoadmapId: l.toRoadmapId, name: l.toRoadmap?.name || null, position: l.position }));
  }

  async _wouldCreateCycle(fromId, toId) {
    if (fromId === toId) return true;
    const seen = new Set();
    let frontier = [toId];
    while (frontier.length) {
      const rows = await models.RoadmapLink.findAll({ where: { fromRoadmapId: { [Op.in]: frontier } }, attributes: ['toRoadmapId'] });
      const next = [];
      for (const r of rows) {
        if (r.toRoadmapId === fromId) return true;
        if (!seen.has(r.toRoadmapId)) { seen.add(r.toRoadmapId); next.push(r.toRoadmapId); }
      }
      frontier = next;
    }
    return false;
  }

  async setNextLinks(authorId, roadmapId, toIds = []) {
    const from = await models.Roadmap.findByPk(roadmapId);
    if (!from) throw new NotFoundError('Roadmap not found');
    const clean = [...new Set((toIds || []).filter(Boolean))];
    for (const toId of clean) {
      if (toId === roadmapId) throw new ValidationError('A roadmap cannot lead to itself');
      const to = await models.Roadmap.findByPk(toId);
      if (!to) throw new ValidationError('One of the next roadmaps does not exist');
      if (await this._wouldCreateCycle(roadmapId, toId)) {
        throw new ValidationError(`"${to.name}" would create a loop in the chain`);
      }
    }
    await models.RoadmapLink.destroy({ where: { fromRoadmapId: roadmapId } });
    if (clean.length) {
      await models.RoadmapLink.bulkCreate(clean.map((toId, i) => ({ fromRoadmapId: roadmapId, toRoadmapId: toId, position: i, createdBy: authorId })));
    }
    return this.getNextLinks(roadmapId);
  }

  async manualAdvance(mentorId, menteeId, nextRoadmapId) {
    return this.assignToMentee(mentorId, nextRoadmapId, menteeId, 0);
  }

  async _startNextRoadmap(menteeId, nextId, prevAssignment, slotId = null) {
    const steps = await this.getSteps(nextId);
    if (!steps.length) return false;
    const enrollment = await this._activeEnrollment(menteeId);
    const existing = await models.RoadmapProgress.findOne({ where: { roadmapId: nextId, menteeId } });
    if (existing && !existing.completed) return false; 
    if (existing) {
      existing.currentStep = 0; existing.completed = false; if (slotId) existing.slot = slotId;
      if (enrollment) existing.enrollmentId = enrollment.id;
      await existing.save();
    } else {
      await models.RoadmapProgress.create({ roadmapId: nextId, menteeId, enrollmentId: enrollment?.id || null, currentStep: 0, slot: slotId, completed: false });
    }
    if (steps[0] && enrollment && prevAssignment) {
      await this._assignStep(steps[0], menteeId, prevAssignment.mentorId, enrollment.id);
    }
    return true;
  }

  async _notifyAdvanced(prevAssignment, menteeId, fromId, nextId, mode, optionIds = []) {
    const mentorId = prevAssignment?.mentorId;
    if (!mentorId) return;
    try {
      const [mentee, fromRm, nextRm] = await Promise.all([
        models.User.findByPk(menteeId, { attributes: ['firstName', 'lastName'] }),
        models.Roadmap.findByPk(fromId, { attributes: ['name'] }),
        nextId ? models.Roadmap.findByPk(nextId, { attributes: ['name'] }) : null,
      ]);
      const who = mentee ? `${mentee.firstName} ${mentee.lastName}`.trim() : 'A mentee';
      const fromName = fromRm?.name || 'a roadmap';
      const msg = mode === 'auto'
        ? `${who} finished "${fromName}" — "${nextRm?.name || 'the next roadmap'}" was assigned automatically.`
        : mode === 'paused'
          ? `${who} finished "${fromName}". Auto-advance is off for them — assign their next roadmap when ready.`
          : `${who} finished "${fromName}". Choose their next roadmap (${optionIds.length} options).`;
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.ROADMAP_ADVANCED,
        recipients: [{ userId: mentorId }],
        payload: {
          title: mode === 'auto' ? 'Roadmap auto-advanced' : 'Pick the next roadmap',
          message: msg,
          actionUrl: `/mentor/mentees/${menteeId}`,
          actionLabel: 'Open mentee',
          relatedEntityType: 'roadmap_advance',
          relatedEntityId: menteeId,
        },
      });
    } catch (e) { console.warn('[roadmap-advance notify]', e.message); }
  }

  async _advanceChain(menteeId, completedRoadmapId, prevAssignment) {
    const links = await models.RoadmapLink.findAll({ where: { fromRoadmapId: completedRoadmapId }, order: [['position', 'ASC']] });
    if (links.length) {
      const enrollment = await this._activeEnrollment(menteeId);
      const autoOn = enrollment ? enrollment.autoAdvanceRoadmaps !== false : true;
      if (links.length === 1 && autoOn) {
        const nextId = links[0].toRoadmapId;
        const started = await this._startNextRoadmap(menteeId, nextId, prevAssignment);
        if (started) { await this._notifyAdvanced(prevAssignment, menteeId, completedRoadmapId, nextId, 'auto'); return nextId; }
        return null;
      }
      await this._notifyAdvanced(prevAssignment, menteeId, completedRoadmapId, null, autoOn ? 'choose' : 'paused', links.map((l) => l.toRoadmapId));
      return null;
    }

    if (!models.MenteeSchedule) return null;
    const ms = await models.MenteeSchedule.findOne({ where: { menteeId } });
    if (!ms || !Array.isArray(ms.schedule)) return null;
    const slot = ms.schedule.find((s) => s.kind === 'roadmap' && Array.isArray(s.roadmapChain) && s.roadmapChain.includes(completedRoadmapId));
    if (!slot) return null;
    const i = slot.roadmapChain.indexOf(completedRoadmapId);
    const nextId = slot.roadmapChain[i + 1];
    if (!nextId) return null;
    const started = await this._startNextRoadmap(menteeId, nextId, prevAssignment, slot.id);
    return started ? nextId : null;
  }

  async startChainHead(mentorId, menteeId, slotId, roadmapChain, startStep = 0) {
    if (!Array.isArray(roadmapChain) || !roadmapChain.length) return null;
    const headId = roadmapChain[0];
    const existing = await models.RoadmapProgress.findOne({ where: { roadmapId: headId, menteeId } });
    if (existing) return null; 
    return this.assignToMentee(mentorId, headId, menteeId, Math.max(0, Number(startStep) || 0), slotId);
  }

  async bulkAssign(mentorId, roadmapId, menteeIds = [], startStep = 0, dueDate = null, stepIndexes = null, stepOverrides = null) {
    const results = [];
    for (const menteeId of menteeIds) {
      try {
        await this.assignToMentee(mentorId, roadmapId, menteeId, startStep, null, dueDate, stepIndexes, stepOverrides);
        results.push({ menteeId, ok: true });
      } catch (error) {
        results.push({ menteeId, ok: false, error: error.message });
      }
    }
    return results;
  }

  async advanceOnSubmission(menteeId, roadmapTaskId) {
    const task = await models.RoadmapTask.findByPk(roadmapTaskId, { attributes: ['id', 'roadmapId'] });
    if (!task || !task.roadmapId) return null;

    const progress = await models.RoadmapProgress.findOne({ where: { roadmapId: task.roadmapId, menteeId } });
    if (!progress) return null;

    const steps = await this.getSteps(task.roadmapId);
    const currentIdx = steps.findIndex((s) => s.id === roadmapTaskId);
    if (currentIdx === -1) return null;

    const nextIdx = currentIdx + 1;
    if (nextIdx >= steps.length) return { atLastStep: true };

    const prevAssignment = await models.AssignedTask.findOne({
      where: { roadmapTaskId, menteeId },
      attributes: ['mentorId', 'enrollmentId']
    });
    if (!prevAssignment) return null;

    await this._assignStep(steps[nextIdx], menteeId, prevAssignment.mentorId, prevAssignment.enrollmentId);
    if ((progress.currentStep || 0) < nextIdx) { progress.currentStep = nextIdx; await progress.save(); }
    return { advancedTo: nextIdx };
  }

  async advanceOnApproval(menteeId, roadmapTaskId) {
    const task = await models.RoadmapTask.findByPk(roadmapTaskId, { attributes: ['id', 'roadmapId'] });
    if (!task || !task.roadmapId) return null;

    const progress = await models.RoadmapProgress.findOne({ where: { roadmapId: task.roadmapId, menteeId } });
    if (!progress) return null;

    const steps = await this.getSteps(task.roadmapId);
    const currentIdx = steps.findIndex((s) => s.id === roadmapTaskId);
    if (currentIdx === -1) return null;

    const prevAssignment = await models.AssignedTask.findOne({
      where: { roadmapTaskId, menteeId },
      attributes: ['mentorId', 'enrollmentId']
    });

    const nextIdx = currentIdx + 1;
    if (nextIdx >= steps.length) {
      progress.currentStep = steps.length;
      progress.completed = true;
      await progress.save();
      const chainedTo = await this._advanceChain(menteeId, task.roadmapId, prevAssignment);
      return chainedTo ? { completed: true, chainedTo } : { completed: true };
    }

    progress.currentStep = nextIdx;
    await progress.save();

    if (prevAssignment) {
      await this._assignStep(steps[nextIdx], menteeId, prevAssignment.mentorId, prevAssignment.enrollmentId);
    }
    return { advancedTo: nextIdx };
  }
}

module.exports = new LinearRoadmapService();
