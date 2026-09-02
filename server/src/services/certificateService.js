const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError, BadRequestError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const aiEvaluationService = require('./aiEvaluationService');

class CertificateService {
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
    let clanIds = mentorClans.map(c => c.clanId || c['clan.id']).filter(Boolean);

    if (clanIds.length === 0 && userRole === 'admin') {
      const allClans = await models.Clan.findAll({
        where: { programId }, limit: 5, attributes: ['id'], raw: true
      });
      clanIds = allClans.map(c => c.id);
    }
    return clanIds;
  }

  /**
   * Create a new certificate template
   */
  async createTemplate({ name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId }, userId) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('Template name is required');
    }
    if (!programId) {
      throw new ValidationError('Program ID is required');
    }
    if (!config || !Array.isArray(config)) {
      throw new ValidationError('Template config must be an array of elements');
    }

    return models.CertificateTemplate.create({
      name: name.trim(),
      bgImageUrl: bgImageUrl || null,
      logoUrl: logoUrl || null,
      logoConfig: logoConfig || null,
      config,
      criteria: criteria || [],
      programId,
      createdBy: userId,
      status: 'active'
    });
  }

  /**
   * List all certificate templates
   */
  async listTemplates(queryProgramId, user) {
    const whereClause = { status: 'active' };

    if (queryProgramId) {
      whereClause.programId = queryProgramId;
    }

    if (user.role === 'mentor') {
      const memberships = await models.ClanMembership.findAll({
        where: {
          userId: user.id,
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
          status: 'active'
        },
        include: [{ model: models.Clan, as: 'clan', attributes: ['programId'] }]
      });
      const programIds = [...new Set(memberships.map(m => m.clan?.programId).filter(Boolean))];

      const shares = await models.Notification.findAll({
        where: {
          userId: user.id,
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

    return models.CertificateTemplate.findAll({
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
  }

  /**
   * Get single template details
   */
  async getTemplate(id) {
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

    return template;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(id, { name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId }) {
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
    return template;
  }

  /**
   * Archive/Delete a template
   */
  async deleteTemplate(id) {
    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' }
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    template.status = 'archived';
    await template.save();
    return true;
  }

  /**
   * Issue certificates to one or more mentees inside a transaction
   */
  async issueCertificates({ templateId, menteeIds, mentorId, tier, recipients }, userId) {
    if (!templateId) {
      throw new ValidationError('Template ID is required');
    }

    const t = await sequelize.transaction();
    try {
      const template = await models.CertificateTemplate.findOne({
        where: { id: templateId, status: 'active' },
        transaction: t
      });

      if (!template) {
        throw new NotFoundError('Certificate template not found');
      }

      let instancesData = [];
      if (Array.isArray(recipients) && recipients.length > 0) {
        instancesData = recipients.map(r => ({
          id: crypto.randomUUID(),
          templateId,
          menteeId: r.menteeId,
          mentorId: mentorId || null,
          issuedBy: userId,
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
          issuedBy: userId,
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

      const instances = await models.CertificateInstance.bulkCreate(instancesData, { transaction: t });
      const queueJobs = await models.CertificateQueue.bulkCreate(queueJobsData, { transaction: t });

      await t.commit();

      return {
        instances: instances.map(i => ({ id: i.id, menteeId: i.menteeId })),
        jobs: queueJobs.map(j => ({ id: j.id, instanceId: j.instanceId })),
        count: instances.length
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /**
   * List all certificates for a mentee
   */
  async listMenteeCertificates(menteeId, user) {
    if (user.role === 'mentee' && user.id !== menteeId) {
      throw new ForbiddenError('You can only view your own certificates');
    }

    return models.CertificateInstance.findAll({
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
  }

  /**
   * Get single certificate instance
   */
  async getCertificateInstance(id, user) {
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

    if (user.role === 'mentee' && user.id !== instance.menteeId) {
      throw new ForbiddenError('You can only view your own certificates');
    }

    return instance;
  }

  /**
   * Upload asset to Cloudinary
   */
  async uploadAsset(fileBuffer) {
    if (!fileBuffer) {
      throw new ValidationError('No file uploaded');
    }
    const result = await uploadToCloudinary(fileBuffer, 'pathment/certificates', 'auto');
    return result.secure_url;
  }

  /**
   * Evaluate qualification
   */
  async getQualification(id, queryMentorId, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const mentorId = user.role === 'mentor' ? user.id : queryMentorId;

    const activeMentees = [];
    const pausedMentees = [];

    if (mentorId) {
      const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, user.role);
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

    const allAssigned = activeIds.length ? await models.AssignedTask.findAll({
      where: { menteeId: { [Op.in]: activeIds }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['menteeId', 'status', 'pointsAwarded', 'pointsBase', 'finalRating', 'isLate'],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title', 'pointsBase'] }]
    }) : [];

    const allBlockers = activeIds.length ? await models.Blocker.findAll({
      where: { menteeId: { [Op.in]: activeIds } },
      attributes: ['menteeId', 'status'],
      raw: true
    }) : [];

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
      const base = row.pointsBase ?? row.roadmapTask?.pointsBase ?? 10;
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

    const criteria = Array.isArray(template.criteria) ? template.criteria : [];
    const allStepIds = [...new Set(criteria.flatMap(t => t.taskIds || []))];
    const stepRows = allStepIds.length ? await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: allStepIds } }, attributes: ['id', 'title']
    }) : [];
    const titleById = Object.fromEntries(stepRows.map(s => [s.id, s.title.trim().toLowerCase()]));

    const enrich = (m, requiredTitles, isParticipation = false, tier = null) => {
      const mx = menteeMetrics[m.id] || {
        completedTitles: new Set(), completedCount: 0, totalTasks: 0,
        totalBase: 0, totalAwarded: 0, onTimeTasks: 0,
        ratedSum: 0, ratedCount: 0, openBlockers: 0
      };

      const normalizedScore = mx.totalBase > 0 ? Math.round((mx.totalAwarded / mx.totalBase) * 100) : 0;
      const completionRate = mx.totalTasks > 0 ? Math.round((mx.completedCount / mx.totalTasks) * 100) : 0;
      const onTimeRate = mx.completedCount > 0 ? Math.round((mx.onTimeTasks / mx.completedCount) * 100) : 0;
      const avgRating = mx.ratedCount > 0 ? parseFloat((mx.ratedSum / mx.ratedCount).toFixed(2)) : null;

      const matched = requiredTitles.length > 0 ? requiredTitles.filter(t => mx.completedTitles.has(t)).length : 0;
      let taskCriteriaMatch = requiredTitles.length > 0
        ? Math.round((matched / requiredTitles.length) * 100)
        : (isParticipation ? 100 : 0);

      if (tier) {
        const minScore = tier.minScorePercent ?? 0;
        const maxBlockers = tier.maxOpenBlockers ?? tier.maxBlockers ?? -1;
        const minCompletion = tier.minCompletionRate ?? 0;
        const minOnTime = tier.minOnTimeRate ?? 0;
        const minRating = tier.minAvgRating ?? 0;
        const hardPass = (
          (minScore <= 0 || normalizedScore >= minScore) &&
          (maxBlockers < 0 || mx.openBlockers <= maxBlockers) &&
          (minCompletion <= 0 || completionRate >= minCompletion) &&
          (minOnTime <= 0 || onTimeRate >= minOnTime) &&
          (minRating <= 0 || (avgRating != null && avgRating >= minRating))
        );
        if (!hardPass) taskCriteriaMatch = 0;
      }

      return {
        ...m,
        completedCount: mx.completedCount,
        totalTasks: mx.totalTasks,
        normalizedScore,
        completionRate,
        onTimeRate,
        avgRating,
        openBlockers: mx.openBlockers,
        criteriaMatch: taskCriteriaMatch,
        issuedTiers: issuedMap[m.id] || []
      };
    };

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
          tierMatches: tierMatchesByMentee[m.id] || { participation: 100 }
        }))
        .filter(m => assignedTierByMentee[m.id] === tierId);
    }

    return {
      ...result,
      criteriaTasks: stepRows.map(s => ({ id: s.id, title: s.title }))
    };
  }

  /**
   * Send template notifications to mentors
   */
  async sendToMentors(id) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;

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
      return { sent: 0 };
    }

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

    try {
      const { emitToUser } = require('../socket');
      for (const n of notifications) {
        emitToUser(n.userId, 'notification:new', { title: n.title, message: n.message, type: n.type });
      }
    } catch (_) { /* socket optional */ }

    return { sent: mentorIds.length };
  }

  /**
   * Get template issuance history
   */
  async getTemplateHistory(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
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
      let status = 'completed';
      if (inst.pdfUrl && inst.imageUrl) {
        status = 'completed';
      } else if (q) {
        status = q.status;
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
  }

  /**
   * Delete / revoke single instance
   */
  async deleteCertificateInstance(id) {
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    await models.CertificateQueue.destroy({ where: { instanceId: id } });
    await instance.destroy();
    return true;
  }

  /**
   * Helper: Reset or create a pending CertificateQueue entry for an instance.
   */
  async resetQueueEntry(instanceId) {
    const [queueEntry, created] = await models.CertificateQueue.findOrCreate({
      where: { instanceId },
      defaults: { status: 'pending', attempts: 0, error: null }
    });

    if (!created) {
      queueEntry.status = 'pending';
      queueEntry.attempts = 0;
      queueEntry.error = null;
      queueEntry.lockedAt = null;
      await queueEntry.save();
    }
    return queueEntry;
  }

  /**
   * Resend single certificate instance
   */
  async resendCertificateInstance(id) {
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    instance.pdfUrl = null;
    instance.imageUrl = null;
    await instance.save();

    await this.resetQueueEntry(id);
    return true;
  }

  /**
   * Revoke all certificates for a template
   */
  async revokeAllTemplateCertificates(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: menteeIds };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      attributes: ['id']
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length > 0) {
      await models.CertificateQueue.destroy({ where: { instanceId: { [Op.in]: instanceIds } } });
      await models.CertificateInstance.destroy({ where: { id: { [Op.in]: instanceIds } } });
    }

    return { count: instances.length };
  }

  /**
   * Resend all or failed certificates for a template
   */
  async resendAllTemplateCertificates(id, failedOnly, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: menteeIds };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length === 0) {
      return { updated: 0 };
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
      return { updated: 0 };
    }

    await models.CertificateInstance.update(
      { pdfUrl: null, imageUrl: null },
      { where: { id: { [Op.in]: targetInstanceIds } } }
    );

    for (const instId of targetInstanceIds) {
      await this.resetQueueEntry(instId);
    }

    return { updated: targetInstanceIds.length };
  }

  /**
   * Run AI evaluation
   */
  async runAIEvaluation(id, queryMentorId, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const criteria = Array.isArray(template.criteria) ? template.criteria : [];

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

    const seenIds = new Set();
    const mentees = menteeRows.filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });

    if (mentees.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    const menteeIds = mentees.map(m => m.id);

    const { runId, total } = await aiEvaluationService.enqueueEvaluation(
      id,
      menteeIds,
      user.id,
      criteria
    );

    return { runId, total };
  }

  /**
   * Get AI evaluation status
   */
  async getAIEvaluationStatus(runId) {
    if (!runId) {
      throw new BadRequestError('runId is required');
    }

    const jobs = await models.AIEvaluationQueue.findAll({
      where: { runId },
      attributes: ['menteeId', 'status', 'result', 'error'],
      raw: true
    });

    if (jobs.length === 0) {
      throw new NotFoundError('Run not found');
    }

    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const pending = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
    const isDone = pending === 0;

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
        lastName: menteeMap[ev.mentee_id]?.lastName ?? '',
        email: menteeMap[ev.mentee_id]?.email ?? ''
      }));
      enrichedResults.sort((a, b) => b.match_score - a.match_score);
    }

    return {
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

module.exports = new CertificateService();
