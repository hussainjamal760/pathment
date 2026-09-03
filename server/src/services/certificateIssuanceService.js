const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const certificateQualificationService = require('./certificateQualificationService');

class CertificateIssuanceService {
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

  async listMenteeCertificates(menteeId, user) {
    if (user.role === 'mentee' && user.id !== menteeId) {
      throw new ForbiddenError('You can only view your own certificates');
    }

    if (user.role === 'mentor') {
      const scopedIds = await certificateQualificationService.getMentorScopedMenteeIds(user.id, null, user.role);
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
      const scopedIds = await certificateQualificationService.getMentorScopedMenteeIds(user.id, null, user.role);
      if (scopedIds !== null && !scopedIds.includes(instance.menteeId)) {
        throw new ForbiddenError('Access denied to this certificate');
      }
    }

    return instance;
  }

  async deleteCertificateInstance(id, user) {
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    if (user && user.role === 'mentor') {
      const scopedIds = await certificateQualificationService.getMentorScopedMenteeIds(user.id, null, user.role);
      if (scopedIds !== null && !scopedIds.includes(instance.menteeId)) {
        throw new ForbiddenError('You can only revoke certificates for mentees in your clan');
      }
    }

    await models.CertificateQueue.destroy({ where: { instanceId: id } });
    await instance.destroy();
    return true;
  }

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
      await models.CertificateQueue.bulkCreate(
        missing.map(id => ({ id: crypto.randomUUID(), instanceId: id, status: 'pending', attempts: 0 }))
      );
    }
  }

  async resendCertificateInstance(id) {
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    instance.pdfUrl = null;
    instance.imageUrl = null;
    await instance.save();

    await this.resetQueueEntry(id);
    return true;
  }

  async revokeAllTemplateCertificates(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    if (user.role === 'mentor') {
      const mentorScopedIds = await certificateQualificationService.getMentorScopedMenteeIds(
        user.id, template.programId, user.role
      );
      if (mentorScopedIds === null) {
        throw new ForbiddenError('Unauthorized: unable to verify program scope');
      }
      if (mentorScopedIds.length === 0) {
        throw new ForbiddenError('You do not have access to this certificate template');
      }
    }

    const whereClause = { templateId: id };

    const menteeIds = await certificateQualificationService.getMentorScopedMenteeIds(user.id, template.programId, user.role);
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

  async resendAllTemplateCertificates(id, failedOnly, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await certificateQualificationService.getMentorScopedMenteeIds(user.id, null, user.role);
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
}

module.exports = new CertificateIssuanceService();
