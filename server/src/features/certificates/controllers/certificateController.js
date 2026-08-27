const { models, sequelize } = require('../../../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../../../utils/errors/errorTypes');

/**
 * Create a new certificate template (Admin only)
 */
exports.createTemplate = async (req, res, next) => {
  try {
    const { name, bgImageUrl, logoUrl, logoConfig, config, criteria } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('Template name is required');
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
    let whereClause = { status: 'active' };

    if (req.user.role === 'mentor') {
      const shares = await models.Notification.findAll({
        where: {
          userId: req.user.id,
          relatedEntityType: 'CertificateTemplate'
        },
        attributes: ['relatedEntityId']
      });
      const sharedIds = [...new Set(shares.map(s => s.relatedEntityId).filter(Boolean))];
      const { Op } = require('sequelize');
      whereClause.id = { [Op.in]: sharedIds };
    }

    const templates = await models.CertificateTemplate.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
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
    const { name, bgImageUrl, logoUrl, logoConfig, config, criteria } = req.body;

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
 */
exports.getQualification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { programId, mentorId } = req.query;
    const { Op } = require('sequelize');

    if (!mentorId && !programId) throw new ValidationError('Either mentorId or programId is required');

    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    // --- 1. Resolve mentee pool ---
    const activeMentees = [];
    const pausedMentees  = [];

    if (mentorId) {
      // Find clans where this mentor is active lead_mentor or co_mentor
      const mentorClans = await models.ClanMembership.findAll({
        where: {
          userId: mentorId,
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
          status: 'active'
        },
        attributes: ['clanId'],
        raw: true
      });
      let clanIds = mentorClans.map(c => c.clanId);

      // Admin fallback for testing: if no clans matched and caller is admin, load first 5 active clans
      if (clanIds.length === 0 && req.user.role === 'admin') {
        const allClans = await models.Clan.findAll({ limit: 5, attributes: ['id'], raw: true });
        clanIds = allClans.map(c => c.id);
      }

      if (clanIds.length > 0) {
        // All mentee-role clan members in those clans
        const menteeMembers = await models.ClanMembership.findAll({
          where: {
            clanId: { [Op.in]: clanIds },
            role: 'mentee',
            status: 'active'
          },
          include: [{
            model: models.User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email', 'status']
          }]
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

    // --- 1.5. Fetch existing issued instances for this template to map to recipients ---
    const existingInstances = await models.CertificateInstance.findAll({
      where: { templateId: id },
      attributes: ['menteeId', 'mentorId', 'tier']
    });

    const issuedMap = {};
    for (const inst of existingInstances) {
      const key = inst.menteeId || inst.mentorId;
      if (key) {
        issuedMap[key] ??= [];
        issuedMap[key].push(inst.tier);
      }
    }

    const activeIds = activeMentees.map(m => m.id);

    // --- 2. All assigned tasks for active mentees ---
    const allAssigned = activeIds.length ? await models.AssignedTask.findAll({
      where: { menteeId: { [Op.in]: activeIds }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['menteeId', 'status'],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }]
    }) : [];

    const menteeStats = {};
    for (const row of allAssigned) {
      const s = menteeStats[row.menteeId] ??= { completedTitles: new Set(), completedCount: 0, totalTasks: 0 };
      s.totalTasks++;
      if (row.status === 'completed') {
        s.completedCount++;
        const title = row.roadmapTask?.title?.trim()?.toLowerCase();
        if (title) s.completedTitles.add(title);
      }
    }

    // --- 3. Resolve criteria task IDs → titles ---
    const criteria = Array.isArray(template.criteria) ? template.criteria : [];
    const allStepIds = [...new Set(criteria.flatMap(t => t.taskIds || []))];
    const stepRows = allStepIds.length ? await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: allStepIds } }, attributes: ['id', 'title']
    }) : [];
    const titleById = Object.fromEntries(stepRows.map(s => [s.id, s.title.trim().toLowerCase()]));

    // --- 4. Enrichment helper ---
    const enrich = (m, requiredTitles, isParticipation = false) => {
      const stats = menteeStats[m.id] || { completedTitles: new Set(), completedCount: 0, totalTasks: 0 };
      const matched = requiredTitles.length > 0
        ? requiredTitles.filter(t => stats.completedTitles.has(t)).length
        : 0;
      return {
        ...m,
        completedCount: stats.completedCount,
        totalTasks: stats.totalTasks,
        criteriaMatch: requiredTitles.length > 0 
          ? Math.round((matched / requiredTitles.length) * 100) 
          : (isParticipation ? 100 : 0),
        issuedTiers: issuedMap[m.id] || []
      };
    };

    // --- 5. Build per-tier result ---
    const result = {
      participation: activeMentees.map(m => enrich(m, [], true)),
      paused: pausedMentees.map(m => ({ ...m, completedCount: 0, totalTasks: 0, criteriaMatch: 0, issuedTiers: issuedMap[m.id] || [] })),
      mentors: []
    };
    for (const tier of criteria) {
      const requiredTitles = (tier.taskIds || []).map(id => titleById[id]).filter(Boolean);
      result[tier.id] = activeMentees.map(m => enrich(m, requiredTitles, tier.id === 'participation'));
    }

    // Populate mentors list if queried by program (Admin)
    if (programId) {
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
          },
          {
            model: models.User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email', 'status']
          }
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
            completedCount: 0,
            totalTasks: 0,
            criteriaMatch: 100,
            assignedTier: 'participation',
            tierMatches: { gold: 100, silver: 100, bronze: 100, participation: 100 },
            issuedTiers: issuedMap[mem.user.id] || []
          });
        }
      }
      result.mentors = uniqueMentors;
    }

    // --- 6. Apply tier-exclusivity filtering based on 90%+ qualification threshold ---
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
        const matches = tierMatchesByMentee[mentee.id] || {};
        if (matches[tierId] >= 90) {
          assignedTier = tierId;
          break;
        }
      }
      assignedTierByMentee[mentee.id] = assignedTier;
    }

    // Filter each list to only include mentees classified in that specific tier and attach metadata
    for (const tierId of orderedTiers) {
      result[tierId] = result[tierId]
        .map(m => ({
          ...m,
          assignedTier: assignedTierByMentee[m.id],
          tierMatches: tierMatchesByMentee[m.id] || { participation: 100 }
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
    const { programId } = req.body;
    if (!programId) throw new ValidationError('Program ID is required');

    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

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
