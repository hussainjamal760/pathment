const { models } = require('../db');
const { Op } = require('sequelize');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

/**
 * certificateTemplateService — Manages certificate templates, CRUD operations, assets, and mentor sharing.
 */
class CertificateTemplateService {
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
      // DEBUG: log received criteria to trace null value persistence
      console.log('[DEBUG updateTemplate] criteria received:', JSON.stringify(criteria, null, 2));
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
}

module.exports = new CertificateTemplateService();
