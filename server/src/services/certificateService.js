const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { enrichEvaluationResults } = require('../utils/aiEvalHelpers');
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

    if (user.role === 'mentor') {
      const scopedIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
      if (scopedIds !== null && !scopedIds.includes(menteeId)) {
        throw new ForbiddenError('You can only view certificates for mentees in your clan');
      }
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

    if (user.role === 'mentor') {
      const scopedIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
      if (scopedIds !== null && !scopedIds.includes(instance.menteeId)) {
        throw new ForbiddenError('Access denied to this certificate');
      }
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

    const criteria = Array.isArray(template.criteria) ? template.criteria : [];
    const aiResults = Array.isArray(template.aiEvaluation?.results) ? template.aiEvaluation.results : [];
    const aiResultMap = Object.fromEntries(aiResults.map(r => [r.mentee_id, r]));
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

    return {
      ...result,
      criteriaTasks: []
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
   * Delete / revoke single instance
   */
  async deleteCertificateInstance(id, user) {
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    if (user && user.role === 'mentor') {
      const scopedIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
      if (scopedIds !== null && !scopedIds.includes(instance.menteeId)) {
        throw new ForbiddenError('You can only revoke certificates for mentees in your clan');
      }
    }

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

  async bulkResetQueueEntries(instanceIds) {
    if (!instanceIds.length) return;

    await models.CertificateQueue.update(
      { status: 'pending', attempts: 0, error: null, lockedAt: null },
      { where: { instanceId: { [Op.in]: instanceIds } } }
    );

    const existing = await models.CertificateQueue.findAll({
      where: { instanceId: { [Op.in]: instanceIds } },
      attributes: ['instanceId'],
      raw: true
    });
    const existingIds = new Set(existing.map(e => e.instanceId));
    const missing = instanceIds.filter(id => !existingIds.has(id));

    if (missing.length > 0) {
      const { v4: uuidv4 } = require('uuid');
      await models.CertificateQueue.bulkCreate(
        missing.map(id => ({ id: uuidv4(), instanceId: id, status: 'pending', attempts: 0 }))
      );
    }
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

    await this.bulkResetQueueEntries(targetInstanceIds);

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

module.exports = new CertificateService();
