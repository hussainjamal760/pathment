const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const clanService = require('./clanService');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

/** Admin clan operations: change requests, cross-clan assignments, policies. */
class ClanRequestsService {
  async overview() {
    const [requests, crossClan, policies] = await Promise.all([
      models.ClanChangeRequest.findAll({
        order: [['status', 'ASC'], ['created_at', 'DESC']],
        include: [
          { model: models.User, as: 'mentee', attributes: ['firstName', 'lastName'] },
          { model: models.Clan, as: 'fromClan', attributes: ['name'] },
          { model: models.Clan, as: 'toClan', attributes: ['name'] }
        ]
      }),
      models.CrossClanAssignment.findAll({
        order: [['created_at', 'DESC']],
        include: [
          { model: models.User, as: 'user', attributes: ['firstName', 'lastName'] },
          { model: models.Clan, as: 'fromClan', attributes: ['name'] },
          { model: models.Clan, as: 'toClan', attributes: ['name'] }
        ]
      }),
      models.OrgPolicy.findAll({ order: [['created_at', 'DESC']] })
    ]);

    return {
      requests: requests.map((r) => ({
        id: r.id,
        mentee: fullName(r.mentee),
        fromClan: r.fromClan?.name || null,
        toClan: r.toClan?.name || null,
        reason: r.reason,
        status: r.status,
        resolutionNote: r.resolutionNote,
        at: r.createdAt
      })),
      crossClan: crossClan.map((c) => ({
        id: c.id,
        kind: c.kind,
        user: fullName(c.user),
        fromClan: c.fromClan?.name || null,
        toClan: c.toClan?.name || null,
        note: c.note,
        at: c.createdAt
      })),
      policies: policies.map((p) => ({ id: p.id, title: p.title, category: p.category, body: p.body }))
    };
  }

  async createRequest({ menteeId, toClanId, fromClanId, reason }, createdBy) {
    if (!menteeId || !toClanId) throw new ValidationError('menteeId and toClanId are required');
    return models.ClanChangeRequest.create({ menteeId, toClanId, fromClanId: fromClanId || null, reason: reason || null, createdBy });
  }

  async resolveRequest(id, { status, note }) {
    if (!['approved', 'denied'].includes(status)) throw new ValidationError('status must be approved or denied');
    const req = await models.ClanChangeRequest.findByPk(id);
    if (!req) throw new NotFoundError('Request not found');

    return sequelize.transaction(async (transaction) => {
      req.status = status;
      req.resolutionNote = note || null;
      await req.save({ transaction });

      if (status === 'approved') {
        // Move the mentee: remove old membership, add to the target clan.
        if (req.fromClanId) {
          const old = await models.ClanMembership.findOne({ where: { clanId: req.fromClanId, userId: req.menteeId }, transaction });
          if (old) { old.status = 'removed'; old.leftAt = new Date(); await old.save({ transaction }); }
        }
      }
      return req;
    }).then(async (req) => {
      if (status === 'approved') {
        await clanService.addMember(req.toClanId, { userId: req.menteeId, role: 'mentee' });
      }
      return req;
    });
  }

  async createCrossClan(data, createdBy) {
    if (!data.kind) throw new ValidationError('kind is required');
    return models.CrossClanAssignment.create({
      kind: data.kind,
      userId: data.userId || null,
      fromClanId: data.fromClanId || null,
      toClanId: data.toClanId || null,
      note: data.note || null,
      createdBy
    });
  }

  async removeCrossClan(id) {
    const a = await models.CrossClanAssignment.findByPk(id);
    if (!a) throw new NotFoundError('Assignment not found');
    await a.destroy();
    return { removed: true };
  }

  async createPolicy(data, createdBy) {
    if (!data.title || !data.body) throw new ValidationError('title and body are required');
    return models.OrgPolicy.create({ title: data.title, category: data.category || null, body: data.body, createdBy });
  }

  async removePolicy(id) {
    const p = await models.OrgPolicy.findByPk(id);
    if (!p) throw new NotFoundError('Policy not found');
    await p.destroy();
    return { removed: true };
  }
}

module.exports = new ClanRequestsService();
