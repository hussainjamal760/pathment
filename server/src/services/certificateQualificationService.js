const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { models, sequelize } = require('../db');
const { enrichEvaluationResults } = require('../utils/aiEvalHelpers');
const { NotFoundError } = require('../utils/errors/errorTypes');
const aiEvaluationService = require('./aiEvaluationService');
const { sortCriteriaByPriority } = require('../utils/criteriaUtils');


/**
 * Deduplicate an array of objects by their `.id` field.
 * REMOVE-6: This pattern appeared in two separate places in the service — extracted here.
 * @param {Array} arr - Array of objects with an `id` property.
 * @returns {Array}
 */
function deduplicateById(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * certificateQualificationService — Handles mentor scoping, mentee eligibility, history, and AI evaluation orchestration.
 */
class CertificateQualificationService {
  /**
   * Helper: Resolve mentee IDs scoped to a mentor's active clans within a program.
   * Returns null if the user is an admin (meaning no mentor clan restriction).
   */
  async getMentorScopedMenteeIds(mentorId, programId, userRole) {
    if (userRole !== 'mentor') return null;

    const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, userRole);
    if (!clanIds || clanIds.length === 0) return [];

    const menteeMembers = await models.ClanMembership.findAll({
      where: {
        clanId: { [Op.in]: clanIds },
        role: 'mentee',
        status: 'active'
      },
      attributes: ['userId'],
      raw: true
    });

    return menteeMembers.map(m => m.userId);
  }

  /**
   * Helper for mentor clan ID lookup in qualification logic.
   */
  async getMentorScopedMenteeClans(mentorId, programId, userRole) {
    const clanInclude = {
      model: models.Clan,
      as: 'clan',
      attributes: []
    };
    if (programId) {
      clanInclude.where = { programId };
    }

    const mentorClans = await models.ClanMembership.findAll({
      where: {
        userId: mentorId,
        role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
        status: 'active'
      },
      attributes: ['clanId'],
      include: [clanInclude],
      raw: true
    });
    let clanIds = mentorClans.map(c => c.clanId || c['clan.id']).filter(Boolean);
    return clanIds;
  }

  /**
   * Evaluate qualification for mentees against a template's criteria tiers
   */
  async getQualification(id, queryMentorId, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const mentorId = user.role === 'mentor' ? user.id : queryMentorId;

    const activeMentees = [];
    const pausedMentees = [];

    // Pre-query set of mentee IDs whose ClanMembership is status='paused' in this program
    const pausedMenteeIdsSet = new Set();
    if (programId) {
      const pausedMemberships = await models.ClanMembership.findAll({
        where: { role: 'mentee', status: 'paused' },
        include: [{
          model: models.Clan,
          as: 'clan',
          where: { programId },
          attributes: ['id']
        }],
        attributes: ['userId'],
        raw: true
      });
      pausedMemberships.forEach(pm => pausedMenteeIdsSet.add(pm.userId));
    }

    if (mentorId) {
      const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, user.role);
      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
        });
        const seenMentees = new Set();
        for (const mem of menteeMembers) {
          if (!mem.user || seenMentees.has(mem.user.id)) continue;
          seenMentees.add(mem.user.id);
          const u = mem.user;
          const row = { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email };
          (mem.status === 'paused' || u.status === 'suspended' || pausedMenteeIdsSet.has(u.id))
            ? pausedMentees.push(row)
            : activeMentees.push(row);
        }
      }
    } else {
      const enrollments = await models.Enrollment.findAll({
        where: { programId },
        include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
      });
      for (const e of enrollments) {
        if (!e.mentee) continue;
        const row = { id: e.mentee.id, firstName: e.mentee.firstName, lastName: e.mentee.lastName, email: e.mentee.email };
        (e.status === 'paused' || e.mentee.status === 'suspended' || pausedMenteeIdsSet.has(e.mentee.id))
          ? pausedMentees.push(row)
          : activeMentees.push(row);
      }
    }

    const existingInstances = await models.CertificateInstance.findAll({
      where: { templateId: id },
      attributes: ['menteeId', 'mentorId', 'tier']
    });
    const issuedMap = {};
    for (const inst of existingInstances) {
      const key = inst.menteeId || inst.mentorId;
      if (key) { issuedMap[key] ??= []; issuedMap[key].push(inst.tier); }
    }

    const criteria = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);

    // Query latest completed evaluation run directly from AIEvaluationQueue
    const latestQueueRun = await models.AIEvaluationQueue.findOne({
      where: { templateId: id, status: 'completed' },
      order: [['createdAt', 'DESC']],
      attributes: ['runId'],
      raw: true
    });

    let aiResults = [];
    if (latestQueueRun) {
      const jobs = await models.AIEvaluationQueue.findAll({
        where: { runId: latestQueueRun.runId, status: 'completed' },
        attributes: ['result'],
        raw: true
      });
      aiResults = jobs.map(j => j.result).filter(Boolean);
    }

    if (aiResults.length === 0 && Array.isArray(template.aiEvaluation?.results)) {
      aiResults = template.aiEvaluation.results;
    }

    const aiResultMap = Object.fromEntries(aiResults.map(r => [r.mentee_id || r.id, r]));
    const hasAiRun = aiResults.length > 0;

    const buildMenteeRow = (m) => {
      const aiEval = aiResultMap[m.id];
      if (hasAiRun && aiEval) {
        return {
          ...m,
          assignedTier: aiEval.certificate_tier || null,
          tierMatches: { [aiEval.certificate_tier || 'participation']: Number(aiEval.match_score) || 0 },
          criteriaMatch: Number(aiEval.match_score) || 0,
          issuedTiers: issuedMap[m.id] || []
        };
      }
      return {
        ...m,
        assignedTier: null,
        tierMatches: {},
        criteriaMatch: null,
        issuedTiers: issuedMap[m.id] || []
      };
    };

    const result = {
      participation: activeMentees.map(buildMenteeRow),
      paused: pausedMentees.map(m => ({ ...m, assignedTier: null, tierMatches: {}, criteriaMatch: null, issuedTiers: issuedMap[m.id] || [] })),
      mentors: []
    };

    for (const tier of criteria) {
      result[tier.id] = activeMentees.map(buildMenteeRow);
    }

    if (programId) {
      const mentorMemberships = await models.ClanMembership.findAll({
        where: { role: { [Op.in]: ['lead_mentor', 'co_mentor'] }, status: 'active' },
        include: [
          { model: models.Clan, as: 'clan', where: { programId }, attributes: [] },
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }
        ]
      });
      const uniqueMentors = [];
      const seenMentorIds = new Set();
      for (const mem of mentorMemberships) {
        if (mem.user && !seenMentorIds.has(mem.user.id)) {
          seenMentorIds.add(mem.user.id);
          uniqueMentors.push({
            id: mem.user.id,
            firstName: mem.user.firstName,
            lastName: mem.user.lastName,
            email: mem.user.email,
            assignedTier: null,
            tierMatches: {},
            criteriaMatch: null,
            issuedTiers: issuedMap[mem.user.id] || []
          });
        }
      }
      result.mentors = uniqueMentors;
    }

    // REMOVE-4: criteriaTasks was always an empty array with no implementation.
    // Removed to avoid confusion. Implement properly if needed in a future iteration.
    return result;
  }

  /**
   * Get template issuance history
   */
  async getTemplateHistory(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await this.getMentorScopedMenteeIds(user.id, template.programId || null, user.role);
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: menteeIds };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      include: [
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const instanceIds = instances.map(i => i.id);
    const queueEntries = instanceIds.length ? await models.CertificateQueue.findAll({
      where: { instanceId: { [Op.in]: instanceIds } }
    }) : [];

    const queueMap = Object.fromEntries(queueEntries.map(q => [q.instanceId, q]));

    return instances.map(inst => {
      const q = queueMap[inst.id];
      const status = (inst.pdfUrl && inst.imageUrl) ? 'completed' : (q?.status ?? 'pending');

      return {
        id: inst.id,
        pdfUrl: inst.pdfUrl,
        imageUrl: inst.imageUrl,
        tier: inst.tier,
        createdAt: inst.createdAt,
        recipient: inst.mentee ? {
          id: inst.mentee.id,
          firstName: inst.mentee.firstName,
          lastName: inst.mentee.lastName,
          email: inst.mentee.email,
          role: inst.mentee.role
        } : null,
        status,
        error: q ? q.error : null
      };
    });
  }

  /**
   * Run AI evaluation for a template
   */
  async runAIEvaluation(id, queryMentorId, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const criteria = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);

    const menteeRows = [];
    const mentorId = user.role === 'mentor' ? user.id : queryMentorId;

    if (mentorId) {
      const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, user.role);
      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: 'active' },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
        });
        for (const m of menteeMembers) {
          if (m.user && m.user.status !== 'suspended') {
            menteeRows.push({ id: m.user.id, firstName: m.user.firstName, lastName: m.user.lastName, email: m.user.email });
          }
        }
      }
    } else {
      const enrollments = await models.Enrollment.findAll({
        where: { programId },
        include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
      });
      for (const e of enrollments) {
        if (e.mentee && e.status !== 'paused' && e.mentee.status !== 'suspended') {
          menteeRows.push({ id: e.mentee.id, firstName: e.mentee.firstName, lastName: e.mentee.lastName, email: e.mentee.email });
        }
      }
    }

    const mentees = deduplicateById(menteeRows); // REMOVE-6: use shared helper

    if (mentees.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    const menteeIds = mentees.map(m => m.id);

    if (!mentorId) {
      // Admin-wide run: no clan scoping — all task sources are included.
      const { runId, total } = await aiEvaluationService.enqueueEvaluation(
        id, menteeIds, user.id, criteria, null
      );
      return { runId, total };
    }

    // BUG-7 fix: For mentors with multiple clans, group mentees by their actual clan and
    // enqueue per-clan group so each mentee's tasks are scored against their own clan's
    // mentor assignments (not just the first clan). All groups share the same runId.
    const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, user.role);
    if (clanIds.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    if (clanIds.length === 1) {
      // Single clan — simple path (original behaviour, correct).
      const { runId, total } = await aiEvaluationService.enqueueEvaluation(
        id, menteeIds, user.id, criteria, clanIds[0]
      );
      return { runId, total };
    }

    // Multi-clan mentor: find each mentee's actual clan and group them.
    const menteeClanMap = new Map(); // menteeId -> clanId
    const memberships = await models.ClanMembership.findAll({
      where: {
        userId:  { [Op.in]: menteeIds },
        clanId:  { [Op.in]: clanIds },
        role:    'mentee',
        status:  'active'
      },
      attributes: ['userId', 'clanId'],
      raw: true
    });
    for (const mem of memberships) {
      if (!menteeClanMap.has(mem.userId)) {
        menteeClanMap.set(mem.userId, mem.clanId);
      }
    }

    // Group menteeIds by their resolved clanId. Mentees with no match fall back to clanIds[0].
    const byClan = new Map();
    for (const menteeId of menteeIds) {
      const clan = menteeClanMap.get(menteeId) ?? clanIds[0];
      if (!byClan.has(clan)) byClan.set(clan, []);
      byClan.get(clan).push(menteeId);
    }

    // Use a pre-generated shared runId so all clan groups belong to the same evaluation run.
    const sharedRunId = uuidv4();
    let total = 0;
    for (const [clanId, clanMenteeIds] of byClan) {
      const r = await aiEvaluationService.enqueueEvaluation(
        id, clanMenteeIds, user.id, criteria, clanId, sharedRunId
      );
      total += r.total;
    }

    return { runId: sharedRunId, total };
  }

  /**
   * Get AI evaluation status
   */
  async getAIEvaluationStatus(runId, templateId) {
    let targetRunId = runId;

    if (!targetRunId && templateId) {
      const latestJob = await models.AIEvaluationQueue.findOne({
        where: { templateId },
        order: [
          [sequelize.literal(`CASE WHEN status IN ('pending', 'processing') THEN 0 ELSE 1 END`), 'ASC'],
          ['createdAt', 'DESC']
        ],
        attributes: ['runId'],
        raw: true
      });
      if (latestJob) targetRunId = latestJob.runId;
    }

    if (!targetRunId) {
      return { isDone: true, runId: null, total: 0, completed: 0, failed: 0, pending: 0, data: [] };
    }

    const jobs = await models.AIEvaluationQueue.findAll({
      where: { runId: targetRunId },
      attributes: ['menteeId', 'status', 'result', 'error'],
      raw: true
    });

    if (jobs.length === 0) {
      return { isDone: true, runId: targetRunId, total: 0, completed: 0, failed: 0, pending: 0, data: [] };
    }

    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const pending = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
    const isDone = pending === 0;

    const completedResults = jobs
      .filter(j => j.status === 'completed' && j.result)
      .map(j => j.result);

    const enrichedResults = await enrichEvaluationResults(completedResults);

    return {
      runId: targetRunId,
      isDone,
      total,
      completed,
      failed,
      pending,
      data: enrichedResults,
      ranAt: isDone ? new Date().toISOString() : null
    };
  }
}

module.exports = new CertificateQualificationService();
