const { models, sequelize } = require('../../../db');
const { Op } = require('sequelize');
const { NotFoundError, ValidationError, ForbiddenError } = require('../../../utils/errors/errorTypes');
const aiEvaluationService = require('../services/aiEvaluationService');

/**
 * Create a new certificate template (Admin only)
 */
exports.createTemplate = async (req, res, next) => {
  try {
    const { name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('Template name is required');
    }
    if (!programId) {
      throw new ValidationError('Program ID is required');
    }
    if (!config || !Array.isArray(config)) {
      throw new ValidationError('Template config must be an array of elements');
    }

    const template = await models.CertificateTemplate.create({
      name: name.trim(),
      bgImageUrl: bgImageUrl || null,
      logoUrl: logoUrl || null,
      logoConfig: logoConfig || null,
      config,
      criteria: criteria || [],
      programId,
      createdBy: req.user.id,
      status: 'active'
    });

    res.status(201).json({
      success: true,
      message: 'Certificate template created successfully',
      data: template
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List all certificate templates (Admin & Mentor)
 */
exports.listTemplates = async (req, res, next) => {
  try {
    const { Op } = require('sequelize');
    let whereClause = { status: 'active' };

    if (req.query.programId) {
      whereClause.programId = req.query.programId;
    }

    if (req.user.role === 'mentor') {
      const memberships = await models.ClanMembership.findAll({
        where: {
          userId: req.user.id,
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
          status: 'active'
        },
        include: [{ model: models.Clan, as: 'clan', attributes: ['programId'] }]
      });
      const programIds = [...new Set(memberships.map(m => m.clan?.programId).filter(Boolean))];

      const shares = await models.Notification.findAll({
        where: {
          userId: req.user.id,
          relatedEntityType: 'CertificateTemplate'
        },
        attributes: ['relatedEntityId']
      });
      const sharedIds = [...new Set(shares.map(s => s.relatedEntityId).filter(Boolean))];

      whereClause[Op.or] = [
        { programId: { [Op.in]: programIds } },
        { id: { [Op.in]: sharedIds } }
      ];
    }

    const templates = await models.CertificateTemplate.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: templates
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get a single template details
 */
exports.getTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' },
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update an existing template (Admin only)
 */
exports.updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId } = req.body;

    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' }
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new ValidationError('Template name cannot be empty');
      }
      template.name = name.trim();
    }

    if (programId !== undefined) {
      if (!programId) {
        throw new ValidationError('Program ID cannot be empty');
      }
      template.programId = programId;
    }

    if (bgImageUrl !== undefined) template.bgImageUrl = bgImageUrl || null;
    if (logoUrl !== undefined) template.logoUrl = logoUrl || null;
    if (logoConfig !== undefined) template.logoConfig = logoConfig || null;
    if (config !== undefined) {
      if (!Array.isArray(config)) {
        throw new ValidationError('Template config must be an array');
      }
      template.config = config;
    }
    if (criteria !== undefined) {
      if (!Array.isArray(criteria)) {
        throw new ValidationError('Template criteria must be an array of tiers');
      }
      template.criteria = criteria;
    }

    await template.save();

    res.status(200).json({
      success: true,
      message: 'Certificate template updated successfully',
      data: template
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete/Archive a template (Admin only)
 */
exports.deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' }
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    // Instead of deleting, archive the template to keep integrity of issued certificates
    template.status = 'archived';
    await template.save();

    res.status(200).json({
      success: true,
      message: 'Certificate template deleted successfully'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Issue certificates to one or more mentees (Admin or Mentor)
 */
exports.issueCertificates = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { templateId, menteeIds, mentorId, tier, recipients } = req.body;

    if (!templateId) {
      throw new ValidationError('Template ID is required');
    }

    const template = await models.CertificateTemplate.findOne({
      where: { id: templateId, status: 'active' },
      transaction: t
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    const crypto = require('crypto');

    // 1. Prepare bulk data with pre-generated UUIDs
    let instancesData = [];
    if (Array.isArray(recipients) && recipients.length > 0) {
      instancesData = recipients.map(r => ({
        id: crypto.randomUUID(),
        templateId,
        menteeId: r.menteeId,
        mentorId: mentorId || null,
        issuedBy: req.user.id,
        pdfUrl: null,
        imageUrl: null,
        tier: r.tier || 'participation',
        metadata: {}
      }));
    } else {
      if (!Array.isArray(menteeIds) || menteeIds.length === 0) {
        throw new ValidationError('At least one mentee ID or recipients list is required');
      }
      instancesData = menteeIds.map(menteeId => ({
        id: crypto.randomUUID(),
        templateId,
        menteeId,
        mentorId: mentorId || null,
        issuedBy: req.user.id,
        pdfUrl: null,
        imageUrl: null,
        tier: tier || 'participation',
        metadata: {}
      }));
    }

    const queueJobsData = instancesData.map(inst => ({
      id: crypto.randomUUID(),
      instanceId: inst.id,
      status: 'pending',
      attempts: 0
    }));

    // 2. Perform bulk insertion inside transaction
    const instances = await models.CertificateInstance.bulkCreate(instancesData, { transaction: t });
    const queueJobs = await models.CertificateQueue.bulkCreate(queueJobsData, { transaction: t });

    await t.commit();

    res.status(201).json({
      success: true,
      message: `Enqueued ${instances.length} certificate(s) for generation`,
      data: {
        instances: instances.map(i => ({ id: i.id, menteeId: i.menteeId })),
        jobs: queueJobs.map(j => ({ id: j.id, instanceId: j.instanceId }))
      }
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

/**
 * List all certificates awarded to a specific mentee (Admin, Mentor, or Mentee themselves)
 */
exports.listMenteeCertificates = async (req, res, next) => {
  try {
    const { menteeId } = req.params;

    // Check authorization: admins/mentors can see anyone's, mentees only their own
    if (req.user.role === 'mentee' && req.user.id !== menteeId) {
      throw new ForbiddenError('You can only view your own certificates');
    }

    const certificates = await models.CertificateInstance.findAll({
      where: { menteeId },
      include: [
        {
          model: models.CertificateTemplate,
          as: 'template',
          attributes: ['id', 'name', 'bgImageUrl']
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: models.User,
          as: 'issuer',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: certificates
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get details of a single certificate instance (Admin, Mentor, or awarded Mentee)
 */
exports.getCertificateInstance = async (req, res, next) => {
  try {
    const { id } = req.params;

    const instance = await models.CertificateInstance.findOne({
      where: { id },
      include: [
        {
          model: models.CertificateTemplate,
          as: 'template'
        },
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: models.User,
          as: 'issuer',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!instance) {
      throw new NotFoundError('Certificate not found');
    }

    // Verify authorization
    if (req.user.role === 'mentee' && req.user.id !== instance.menteeId) {
      throw new ForbiddenError('You can only view your own certificates');
    }

    res.status(200).json({
      success: true,
      data: instance
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Upload an asset (Background image or logo) to Cloudinary (Admin only)
 */
exports.uploadAsset = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const { uploadToCloudinary } = require('../../../utils/cloudinaryUpload');
    const result = await uploadToCloudinary(req.file.buffer, 'pathment/certificates', 'auto');

    res.status(200).json({
      success: true,
      url: result.secure_url
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Evaluate qualification per tier with enriched mentee data.
 * Scope is determined by query params:
 *  - ?mentorId=<id>   → mentees in clans where mentor is lead_mentor/co_mentor
 *  - ?programId=<id>  → all enrollments in that program (admin view)
 *
 * Hard constraints from criteria are enforced server-side:
 *  minScorePercent, maxOpenBlockers, minCompletionRate, minOnTimeRate, minAvgRating
 */
exports.getQualification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mentorId: queryMentorId } = req.query;
    const { Op } = require('sequelize');

    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const mentorId = req.user.role === 'mentor' ? req.user.id : queryMentorId;

    // --- 1. Resolve mentee pool ---
    const activeMentees = [];
    const pausedMentees  = [];

    if (mentorId) {
      const mentorClans = await models.ClanMembership.findAll({
        where: {
          userId: mentorId,
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
          status: 'active'
        },
        attributes: ['clanId'],
        include: [{
          model: models.Clan,
          as: 'clan',
          where: { programId },
          attributes: []
        }],
        raw: true
      });
      let clanIds = mentorClans.map(c => c.clanId || c['clan.id']);

      if (clanIds.length === 0 && req.user.role === 'admin') {
        const allClans = await models.Clan.findAll({
          where: { programId }, limit: 5, attributes: ['id'], raw: true
        });
        clanIds = allClans.map(c => c.id);
      }

      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: 'active' },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
        });
        for (const mem of menteeMembers) {
          if (!mem.user) continue;
          const u = mem.user;
          const row = { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email };
          u.status === 'suspended' ? pausedMentees.push(row) : activeMentees.push(row);
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
        (e.status === 'paused' || e.mentee.status === 'suspended') ? pausedMentees.push(row) : activeMentees.push(row);
      }
    }

    // --- 1.5. Fetch existing issued instances ---
    const existingInstances = await models.CertificateInstance.findAll({
      where: { templateId: id },
      attributes: ['menteeId', 'mentorId', 'tier']
    });
    const issuedMap = {};
    for (const inst of existingInstances) {
      const key = inst.menteeId || inst.mentorId;
      if (key) { issuedMap[key] ??= []; issuedMap[key].push(inst.tier); }
    }

    const activeIds = activeMentees.map(m => m.id);

    // --- 2. Fetch tasks with points, rating, and lateness ---
    const allAssigned = activeIds.length ? await models.AssignedTask.findAll({
      where: { menteeId: { [Op.in]: activeIds }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['menteeId', 'status', 'pointsAwarded', 'pointsBase', 'finalRating', 'isLate'],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title', 'pointsBase'] }]
    }) : [];

    // --- 3. Fetch blockers for open-blocker count ---
    const allBlockers = activeIds.length ? await models.Blocker.findAll({
      where: { menteeId: { [Op.in]: activeIds } },
      attributes: ['menteeId', 'status'],
      raw: true
    }) : [];

    // --- 4. Compute per-mentee metrics (all server-side, ground-truth numbers) ---
    const menteeMetrics = {};
    for (const mid of activeIds) {
      menteeMetrics[mid] = {
        completedTitles: new Set(),
        completedCount: 0, totalTasks: 0,
        totalBase: 0, totalAwarded: 0,
        onTimeTasks: 0,
        ratedSum: 0, ratedCount: 0,
        openBlockers: 0
      };
    }
    for (const row of allAssigned) {
      const m = menteeMetrics[row.menteeId];
      if (!m) continue;
      m.totalTasks++;
      const base    = row.pointsBase ?? row.roadmapTask?.pointsBase ?? 10;
      const awarded = row.pointsAwarded ?? 0;
      m.totalBase += base;
      if (row.status === 'completed') {
        m.completedCount++;
        m.totalAwarded += awarded;
        if (!row.isLate) m.onTimeTasks++;
        const rating = row.finalRating != null ? parseFloat(row.finalRating) : null;
        if (rating != null) { m.ratedSum += rating; m.ratedCount++; }
        const title = row.roadmapTask?.title?.trim()?.toLowerCase();
        if (title) m.completedTitles.add(title);
      }
    }
    for (const row of allBlockers) {
      const m = menteeMetrics[row.menteeId];
      if (m && row.status !== 'resolved') m.openBlockers++;
    }

    // --- 5. Resolve criteria task IDs → titles (legacy support) ---
    const criteria = Array.isArray(template.criteria) ? template.criteria : [];
    const allStepIds = [...new Set(criteria.flatMap(t => t.taskIds || []))];
    const stepRows = allStepIds.length ? await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: allStepIds } }, attributes: ['id', 'title']
    }) : [];
    const titleById = Object.fromEntries(stepRows.map(s => [s.id, s.title.trim().toLowerCase()]));

    // --- 6. Enrichment helper ---
    const enrich = (m, requiredTitles, isParticipation = false, tier = null) => {
      const mx = menteeMetrics[m.id] || {
        completedTitles: new Set(), completedCount: 0, totalTasks: 0,
        totalBase: 0, totalAwarded: 0, onTimeTasks: 0,
        ratedSum: 0, ratedCount: 0, openBlockers: 0
      };

      const normalizedScore = mx.totalBase > 0
        ? Math.round((mx.totalAwarded / mx.totalBase) * 100) : 0;
      const completionRate  = mx.totalTasks > 0
        ? Math.round((mx.completedCount / mx.totalTasks) * 100) : 0;
      const onTimeRate      = mx.completedCount > 0
        ? Math.round((mx.onTimeTasks / mx.completedCount) * 100) : 0;
      const avgRating       = mx.ratedCount > 0
        ? parseFloat((mx.ratedSum / mx.ratedCount).toFixed(2)) : null;

      const matched = requiredTitles.length > 0
        ? requiredTitles.filter(t => mx.completedTitles.has(t)).length : 0;
      let taskCriteriaMatch = requiredTitles.length > 0
        ? Math.round((matched / requiredTitles.length) * 100)
        : (isParticipation ? 100 : 0);

      // Apply hard constraints: any failure → criteriaMatch = 0
      if (tier) {
        const minScore      = tier.minScorePercent    ?? 0;
        const maxBlockers   = tier.maxOpenBlockers ?? tier.maxBlockers ?? -1;
        const minCompletion = tier.minCompletionRate  ?? 0;
        const minOnTime     = tier.minOnTimeRate      ?? 0;
        const minRating     = tier.minAvgRating       ?? 0;
        const hardPass = (
          (minScore      <= 0 || normalizedScore  >= minScore) &&
          (maxBlockers   < 0  || mx.openBlockers  <= maxBlockers) &&
          (minCompletion <= 0 || completionRate   >= minCompletion) &&
          (minOnTime     <= 0 || onTimeRate       >= minOnTime) &&
          (minRating     <= 0 || (avgRating != null && avgRating >= minRating))
        );
        if (!hardPass) taskCriteriaMatch = 0;
      }

      return {
        ...m,
        completedCount: mx.completedCount,
        totalTasks:     mx.totalTasks,
        normalizedScore,
        completionRate,
        onTimeRate,
        avgRating,
        openBlockers:   mx.openBlockers,
        criteriaMatch:  taskCriteriaMatch,
        issuedTiers:    issuedMap[m.id] || []
      };
    };

    // --- 7. Build per-tier result ---
    const result = {
      participation: activeMentees.map(m => enrich(m, [], true)),
      paused: pausedMentees.map(m => ({
        ...m, completedCount: 0, totalTasks: 0, normalizedScore: 0,
        completionRate: 0, onTimeRate: 0, avgRating: null, openBlockers: 0,
        criteriaMatch: 0, issuedTiers: issuedMap[m.id] || []
      })),
      mentors: []
    };
    for (const tier of criteria) {
      const requiredTitles = (tier.taskIds || []).map(id => titleById[id]).filter(Boolean);
      result[tier.id] = activeMentees.map(m => enrich(m, requiredTitles, tier.id === 'participation', tier));
    }

    // --- 8. Populate mentors list (Admin program-wide view) ---
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
            completedCount: 0, totalTasks: 0,
            normalizedScore: 100, completionRate: 100, onTimeRate: 100,
            avgRating: null, openBlockers: 0,
            criteriaMatch: 100,
            assignedTier: 'participation',
            tierMatches: { participation: 100 },
            issuedTiers: issuedMap[mem.user.id] || []
          });
        }
      }
      result.mentors = uniqueMentors;
    }

    // --- 9. Tier-exclusivity: assign each mentee to their highest qualifying tier ---
    const orderedTiers = [...criteria.map(c => c.id), 'participation'];
    const tierMatchesByMentee = {};
    for (const mentee of activeMentees) {
      const matches = { participation: 100 };
      for (const tier of criteria) {
        const menteeInTier = result[tier.id].find(m => m.id === mentee.id);
        matches[tier.id] = menteeInTier ? menteeInTier.criteriaMatch : 0;
      }
      tierMatchesByMentee[mentee.id] = matches;
    }

    const assignedTierByMentee = {};
    for (const mentee of activeMentees) {
      let assignedTier = 'participation';
      for (const tierId of criteria.map(c => c.id)) {
        if ((tierMatchesByMentee[mentee.id]?.[tierId] ?? 0) >= 90) {
          assignedTier = tierId;
          break;
        }
      }
      assignedTierByMentee[mentee.id] = assignedTier;
    }

    for (const tierId of orderedTiers) {
      result[tierId] = result[tierId]
        .map(m => ({
          ...m,
          assignedTier: assignedTierByMentee[m.id],
          tierMatches:  tierMatchesByMentee[m.id] || { participation: 100 }
        }))
        .filter(m => assignedTierByMentee[m.id] === tierId);
    }

    res.status(200).json({
      success: true,
      data: result,
      criteriaTasks: stepRows.map(s => ({ id: s.id, title: s.title }))
    });
  } catch (err) {
    next(err);
  }
};


/**
 * Send template notification to all mentors in a program.
 */
exports.sendToMentors = async (req, res, next) => {
  try {
    const { id } = req.params;

    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const { Op } = require('sequelize');

    // Find all active mentors in clans belonging to this program
    const mentorMemberships = await models.ClanMembership.findAll({
      where: {
        role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
        status: 'active'
      },
      include: [
        {
          model: models.Clan,
          as: 'clan',
          where: { programId },
          attributes: []
        }
      ],
      attributes: ['userId']
    });
    const mentorIds = [...new Set(mentorMemberships.map(m => m.userId).filter(Boolean))];

    if (mentorIds.length === 0) {
      return res.status(200).json({ success: true, message: 'No active mentors found in this program.', sent: 0 });
    }

    // Create notifications
    const notifications = mentorIds.map(mentorId => ({
      userId: mentorId,
      type: 'system',
      audience: 'mentor',
      title: `Certificate template shared: ${template.name}`,
      message: `An admin has shared the certificate template "${template.name}" with you. Review criteria and your mentees' eligibility.`,
      actionUrl: `/mentor/certificates`,
      actionLabel: 'View Certificates',
      relatedEntityType: 'CertificateTemplate',
      relatedEntityId: template.id,
      status: 'unread'
    }));

    await models.Notification.bulkCreate(notifications);

    // Push live via socket
    try {
      const { emitToUser } = require('../../socket');
      for (const n of notifications) {
        emitToUser(n.userId, 'notification:new', { title: n.title, message: n.message, type: n.type });
      }
    } catch (_) { /* socket optional */ }

    res.status(200).json({ success: true, message: `Sent to ${mentorIds.length} mentor(s).`, sent: mentorIds.length });
  } catch (err) {
    next(err);
  }
};

/**
 * Get history of certificates issued for a template.
 */
exports.getTemplateHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Op } = require('sequelize');

    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    let whereClause = { templateId: id };

    if (req.user.role === 'mentor') {
      const mentorClans = await models.ClanMembership.findAll({
        where: {
          userId: req.user.id,
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
          status: 'active'
        },
        attributes: ['clanId'],
        raw: true
      });
      const clanIds = mentorClans.map(c => c.clanId);

      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: {
            clanId: { [Op.in]: clanIds },
            role: 'mentee',
            status: 'active'
          },
          attributes: ['userId'],
          raw: true
        });
        const menteeIds = menteeMembers.map(m => m.userId);
        whereClause.menteeId = { [Op.in]: menteeIds };
      } else {
        whereClause.menteeId = { [Op.in]: [] };
      }
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

    const history = instances.map(inst => {
      const q = queueMap[inst.id];
      let status = 'completed';
      if (inst.pdfUrl && inst.imageUrl) {
        status = 'completed';
      } else if (q) {
        status = q.status; // 'pending', 'processing', 'completed', 'failed'
      } else {
        status = 'pending';
      }

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

    res.status(200).json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete / Revoke a certificate instance.
 */
exports.deleteCertificateInstance = async (req, res, next) => {
  try {
    const { id } = req.params;

    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    await models.CertificateQueue.destroy({ where: { instanceId: id } });
    await instance.destroy();

    res.status(200).json({ success: true, message: 'Certificate instance deleted/revoked successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * Queue a certificate instance for regeneration/resend.
 */
exports.resendCertificateInstance = async (req, res, next) => {
  try {
    const { id } = req.params;

    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    instance.pdfUrl = null;
    instance.imageUrl = null;
    await instance.save();

    const [queueEntry, created] = await models.CertificateQueue.findOrCreate({
      where: { instanceId: id },
      defaults: {
        status: 'pending',
        attempts: 0,
        error: null
      }
    });

    if (!created) {
      queueEntry.status = 'pending';
      queueEntry.attempts = 0;
      queueEntry.error = null;
      queueEntry.lockedAt = null;
      await queueEntry.save();
    }

    res.status(200).json({ success: true, message: 'Certificate queued for regeneration successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * Revoke/delete all certificate instances for a template.
 */
exports.revokeAllTemplateCertificates = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Op } = require('sequelize');

    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    let whereClause = { templateId: id };

    if (req.user.role === 'mentor') {
      const mentorClans = await models.ClanMembership.findAll({
        where: {
          userId: req.user.id,
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
          status: 'active'
        },
        attributes: ['clanId'],
        raw: true
      });
      const clanIds = mentorClans.map(c => c.clanId);

      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: {
            clanId: { [Op.in]: clanIds },
            role: 'mentee',
            status: 'active'
          },
          attributes: ['userId'],
          raw: true
        });
        const menteeIds = menteeMembers.map(m => m.userId);
        whereClause.menteeId = { [Op.in]: menteeIds };
      } else {
        whereClause.menteeId = { [Op.in]: [] };
      }
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      attributes: ['id']
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length > 0) {
      await models.CertificateQueue.destroy({ where: { instanceId: { [Op.in]: instanceIds } } });
      await models.CertificateInstance.destroy({ where: { templateId: id } });
    }

    res.status(200).json({
      success: true,
      message: `Successfully revoked all ${instances.length} certificates for this template`
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Resend/regenerate all or failed-only certificates for a template.
 */
exports.resendAllTemplateCertificates = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { failedOnly } = req.body;
    const { Op } = require('sequelize');

    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    let whereClause = { templateId: id };

    if (req.user.role === 'mentor') {
      const mentorClans = await models.ClanMembership.findAll({
        where: {
          userId: req.user.id,
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
          status: 'active'
        },
        attributes: ['clanId'],
        raw: true
      });
      const clanIds = mentorClans.map(c => c.clanId);

      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: {
            clanId: { [Op.in]: clanIds },
            role: 'mentee',
            status: 'active'
          },
          attributes: ['userId'],
          raw: true
        });
        const menteeIds = menteeMembers.map(m => m.userId);
        whereClause.menteeId = { [Op.in]: menteeIds };
      } else {
        whereClause.menteeId = { [Op.in]: [] };
      }
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length === 0) {
      return res.status(200).json({ success: true, message: 'No certificate instances found to resend.', updated: 0 });
    }

    const queueEntries = await models.CertificateQueue.findAll({
      where: { instanceId: { [Op.in]: instanceIds } }
    });
    const queueMap = Object.fromEntries(queueEntries.map(q => [q.instanceId, q]));

    let targetInstanceIds = [];
    if (failedOnly) {
      targetInstanceIds = instances.filter(inst => {
        const q = queueMap[inst.id];
        return q && q.status === 'failed';
      }).map(i => i.id);
    } else {
      targetInstanceIds = instanceIds;
    }

    if (targetInstanceIds.length === 0) {
      return res.status(200).json({ success: true, message: 'No matching certificates found to resend.', updated: 0 });
    }

    await models.CertificateInstance.update(
      { pdfUrl: null, imageUrl: null },
      { where: { id: { [Op.in]: targetInstanceIds } } }
    );

    for (const instId of targetInstanceIds) {
      const [queueEntry, created] = await models.CertificateQueue.findOrCreate({
        where: { instanceId: instId },
        defaults: { status: 'pending', attempts: 0, error: null }
      });

      if (!created) {
        queueEntry.status = 'pending';
        queueEntry.attempts = 0;
        queueEntry.error = null;
        queueEntry.lockedAt = null;
        await queueEntry.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully queued ${targetInstanceIds.length} certificate(s) for regeneration`,
      updated: targetInstanceIds.length
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Run AI evaluation for a certificate template — ASYNC queue-based.
 * Enqueues one job per mentee → worker processes them one by one.
 * Results stream back to the client via socket.io as they complete.
 * POST /api/certificates/templates/:id/ai-evaluate  (Admin / Mentor)
 */
exports.runAIEvaluation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Op } = require('sequelize');

    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const criteria = Array.isArray(template.criteria) ? template.criteria : [];

    // ── Resolve mentee pool ──────────────────────────────────────────────
    const menteeRows = [];
    const mentorId = req.user.role === 'mentor' ? req.user.id : req.query.mentorId;

    if (mentorId) {
      const mentorClans = await models.ClanMembership.findAll({
        where: { userId: mentorId, role: { [Op.in]: ['lead_mentor', 'co_mentor'] }, status: 'active' },
        attributes: ['clanId'],
        include: [{ model: models.Clan, as: 'clan', where: { programId }, attributes: [] }],
        raw: true
      });
      let clanIds = mentorClans.map(c => c.clanId || c['clan.id']);
      if (clanIds.length === 0 && req.user.role === 'admin') {
        const allClans = await models.Clan.findAll({ where: { programId }, limit: 5, attributes: ['id'], raw: true });
        clanIds = allClans.map(c => c.id);
      }

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
      // Admin: program-wide enrollments
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

    // Deduplicate
    const seenIds = new Set();
    const mentees = menteeRows.filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });

    if (mentees.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        ranAt: new Date().toISOString(),
        message: 'No active mentees found in this program.'
      });
    }

    const menteeIds = mentees.map(m => m.id);

    // ── Enqueue per-mentee evaluation jobs ────────────────────────────────
    const { runId, total } = await aiEvaluationService.enqueueEvaluation(
      id,
      menteeIds,
      req.user.id,
      criteria
    );

    res.status(202).json({
      success: true,
      runId,
      total,
      message: `Queued ${total} mentee evaluations. Results will arrive via real-time updates.`
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get AI evaluation run status — polling fallback if socket disconnects.
 * GET /api/certificates/templates/:id/ai-evaluate/status?runId=xxx
 */
exports.getAIEvaluationStatus = async (req, res, next) => {
  try {
    const { runId } = req.query;
    if (!runId) {
      return res.status(400).json({ success: false, message: 'runId is required' });
    }

    const jobs = await models.AIEvaluationQueue.findAll({
      where: { runId },
      attributes: ['menteeId', 'status', 'result', 'error'],
      raw: true
    });

    if (jobs.length === 0) {
      return res.status(404).json({ success: false, message: 'Run not found' });
    }

    const total     = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed    = jobs.filter(j => j.status === 'failed').length;
    const pending   = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
    const isDone    = pending === 0;

    // Collect completed results with mentee names
    const completedResults = jobs
      .filter(j => j.status === 'completed' && j.result)
      .map(j => j.result);

    let enrichedResults = completedResults;
    if (completedResults.length > 0) {
      const menteeIds = completedResults.map(r => r.mentee_id);
      const mentees = await models.User.findAll({
        where: { id: { [Op.in]: menteeIds } },
        attributes: ['id', 'firstName', 'lastName', 'email'],
        raw: true
      });
      const menteeMap = Object.fromEntries(mentees.map(m => [m.id, m]));
      enrichedResults = completedResults.map(ev => ({
        ...ev,
        firstName: menteeMap[ev.mentee_id]?.firstName ?? '',
        lastName:  menteeMap[ev.mentee_id]?.lastName  ?? '',
        email:     menteeMap[ev.mentee_id]?.email     ?? ''
      }));
      enrichedResults.sort((a, b) => b.match_score - a.match_score);
    }

    res.status(200).json({
      success: true,
      isDone,
      total,
      completed,
      failed,
      pending,
      data: enrichedResults,
      ranAt: isDone ? new Date().toISOString() : null
    });
  } catch (err) {
    next(err);
  }
};

