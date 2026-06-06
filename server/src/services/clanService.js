const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');

/**
 * Clan service - clans are mentor-led groups inside a Program. A mentee is
 * placed into a clan (clan-based assignment, replacing 1:1 matching) and
 * inherits the clan's mentor(s). Membership roles are clan-scoped.
 */

// Which platform capability a clan role implies.
const CAPABILITY_FOR_CLAN_ROLE = {
  lead_mentor: 'mentor',
  co_mentor: 'mentor',
  core_team: 'mentor',
  mentee: 'mentee'
};

class ClanService {
  /**
   * Ensure a user holds a platform capability (adds it if missing). Used when
   * an admin/lead assigns a clan role, so the user can switch into that view.
   */
  async ensureCapability(user, capability, transaction) {
    const caps = Array.isArray(user.capabilities) ? user.capabilities : [];
    if (!caps.includes(capability)) {
      user.capabilities = [...caps, capability];
      await user.save({ transaction });
    }
    return user;
  }

  async listClans({ programId, status, userId } = {}) {
    const where = {};
    if (programId) where.programId = programId;
    if (status) where.status = status;

    const clans = await models.Clan.findAll({
      where,
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] },
        { model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
        {
          model: models.ClanMembership,
          as: 'memberships',
          required: false,
          where: { status: 'active' },
          attributes: ['id', 'userId', 'role', 'status']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return clans;
  }

  async getClanById(clanId) {
    const clan = await models.Clan.findByPk(clanId, {
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'status'] },
        { model: models.User, as: 'leadMentor', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
        {
          model: models.ClanMembership,
          as: 'memberships',
          required: false,
          where: { status: 'active' },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role'] }]
        }
      ]
    });

    if (!clan) throw new NotFoundError('Clan not found');
    return clan;
  }

  async createClan(data, createdBy) {
    const { programId, name } = data;
    if (!programId || !name) {
      throw new ValidationError('programId and name are required');
    }

    const program = await models.Program.findByPk(programId);
    if (!program) throw new NotFoundError('Program not found');

    return sequelize.transaction(async (transaction) => {
      const clan = await models.Clan.create({
        programId,
        name,
        description: data.description || null,
        leadMentorId: data.leadMentorId || null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        maxMentees: data.maxMentees || 25,
        status: data.status || 'active',
        createdBy
      }, { transaction });

      // If a lead mentor was provided, also create their lead_mentor membership
      // and ensure they hold the mentor capability.
      if (data.leadMentorId) {
        const leadUser = await models.User.findByPk(data.leadMentorId, { transaction });
        if (!leadUser) throw new NotFoundError('Lead mentor user not found');
        await this.ensureCapability(leadUser, 'mentor', transaction);
        await models.ClanMembership.create({
          clanId: clan.id,
          userId: data.leadMentorId,
          role: 'lead_mentor',
          status: 'active'
        }, { transaction });
      }

      return clan;
    });
  }

  async updateClan(clanId, updates) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');

    const allowed = ['name', 'description', 'leadMentorId', 'tags', 'maxMentees', 'status', 'healthStatus'];
    allowed.forEach((key) => {
      if (updates[key] !== undefined) clan[key] = updates[key];
    });
    await clan.save();
    return clan;
  }

  /**
   * Add (or reactivate) a member in a clan with a clan-scoped role. This is the
   * clan-based assignment entry point: assigning a mentee here is how they're
   * "matched". Ensures the user gains the implied platform capability.
   */
  async addMember(clanId, { userId, role, enrollmentId }) {
    if (!userId || !role) throw new ValidationError('userId and role are required');
    if (!CAPABILITY_FOR_CLAN_ROLE[role]) throw new ValidationError(`Invalid clan role: ${role}`);

    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');

    const user = await models.User.findByPk(userId);
    if (!user) throw new NotFoundError('User not found');

    return sequelize.transaction(async (transaction) => {
      await this.ensureCapability(user, CAPABILITY_FOR_CLAN_ROLE[role], transaction);

      let membership = await models.ClanMembership.findOne({ where: { clanId, userId }, transaction });
      if (membership) {
        membership.role = role;
        membership.status = 'active';
        membership.leftAt = null;
        if (enrollmentId) membership.enrollmentId = enrollmentId;
        await membership.save({ transaction });
      } else {
        membership = await models.ClanMembership.create({
          clanId,
          userId,
          role,
          status: 'active',
          enrollmentId: enrollmentId || null
        }, { transaction });
      }

      // Keep the clan's lead_mentor pointer in sync when assigning a lead.
      if (role === 'lead_mentor' && clan.leadMentorId !== userId) {
        clan.leadMentorId = userId;
        await clan.save({ transaction });
      }

      // Placing a mentee in a clan IS their placement - make sure they have an
      // active enrollment in the clan's program so the mentee dashboard reflects
      // it and tasks (which require an enrollment) can be assigned to them.
      if (role === 'mentee') {
        let enrollment = await models.Enrollment.findOne({
          where: { menteeId: userId, programId: clan.programId },
          transaction
        });
        if (!enrollment) {
          enrollment = await models.Enrollment.create({
            menteeId: userId,
            programId: clan.programId,
            status: 'active',
            enrolledAt: new Date()
          }, { transaction });
        } else if (['rejected', 'dropped'].includes(enrollment.status)) {
          enrollment.status = 'active';
          await enrollment.save({ transaction });
        }
        if (membership.enrollmentId !== enrollment.id) {
          membership.enrollmentId = enrollment.id;
          await membership.save({ transaction });
        }
      }

      return membership;
    });
  }

  async removeMember(clanId, userId) {
    const membership = await models.ClanMembership.findOne({ where: { clanId, userId } });
    if (!membership) throw new NotFoundError('Membership not found');
    membership.status = 'removed';
    membership.leftAt = new Date();
    await membership.save();
    return membership;
  }

  /**
   * Mentees not currently in ANY active clan ("leftover" people a lead mentor can
   * pull into their clan). Optional `q` filters by name/email.
   */
  async listAvailableMembers({ q } = {}) {
    const { Op } = require('sequelize');
    const assigned = await models.ClanMembership.findAll({ where: { status: 'active' }, attributes: ['userId'] });
    const assignedIds = [...new Set(assigned.map((m) => m.userId).filter(Boolean))];

    const where = { role: 'mentee', status: 'active' };
    if (assignedIds.length) where.id = { [Op.notIn]: assignedIds };
    if (q && q.trim()) {
      const like = { [Op.iLike]: `%${q.trim()}%` };
      where[Op.and] = [{ [Op.or]: [{ firstName: like }, { lastName: like }, { email: like }] }];
    }
    const users = await models.User.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email'],
      order: [['firstName', 'ASC']],
      limit: 50
    });
    return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email, email: u.email }));
  }

  /**
   * Lead mentor invites a new person straight into their clan as a mentee.
   * Reuses the registration-invite flow, pre-scoped to the clan + its program.
   */
  async inviteToClan(clanId, email, invitedBy) {
    if (!email || !email.trim()) throw new ValidationError('Email is required');
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Clan not found');
    const adminService = require('./adminService');
    return adminService.createRegistrationInvite(
      { email: email.trim(), role: 'mentee', clanId, programId: clan.programId },
      invitedBy
    );
  }

  async getMembershipsForUser(userId) {
    return models.ClanMembership.findAll({
      where: { userId, status: 'active' },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name', 'programId', 'status'] }],
      order: [['joinedAt', 'DESC']]
    });
  }

  /**
   * Programs a mentor is responsible for (leads or co-mentors), each with the
   * clans they run inside it and roster counts. Powers the mentor "My Programs"
   * view - mentors only ever see programs/clans they're actually assigned to.
   */
  async getMentorPrograms(userId) {
    const memberships = await models.ClanMembership.findAll({
      where: { userId, role: ['lead_mentor', 'co_mentor'], status: 'active' },
      include: [{
        model: models.Clan,
        as: 'clan',
        attributes: ['id', 'name', 'programId', 'status'],
        include: [
          { model: models.Program, as: 'program', attributes: ['id', 'name', 'status', 'visibility', 'description'] },
          { model: models.ClanMembership, as: 'memberships', required: false, where: { status: 'active' }, attributes: ['id', 'role'] }
        ]
      }]
    });

    const programs = new Map();
    for (const m of memberships) {
      const clan = m.clan;
      if (!clan) continue;
      const program = clan.program;
      const pid = program?.id || 'unassigned';
      if (!programs.has(pid)) {
        programs.set(pid, {
          id: pid,
          name: program?.name || 'Unassigned',
          status: program?.status || null,
          visibility: program?.visibility || null,
          description: program?.description || null,
          clans: []
        });
      }
      const ms = clan.memberships || [];
      programs.get(pid).clans.push({
        id: clan.id,
        name: clan.name,
        myRole: m.role,
        menteeCount: ms.filter((x) => x.role === 'mentee').length,
        mentorCount: ms.filter((x) => ['lead_mentor', 'co_mentor'].includes(x.role)).length
      });
    }

    return [...programs.values()].map((p) => ({
      ...p,
      clanCount: p.clans.length,
      menteeCount: p.clans.reduce((s, c) => s + c.menteeCount, 0)
    }));
  }
}

module.exports = new ClanService();
