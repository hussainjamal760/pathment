const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const cohortService = require('./cohortService');
const clanService = require('./clanService');

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * promotionService — the mentee→co-mentor pipeline. Readiness/willingness are
 * computed from the mentee's real stats + working-style read, mirroring the
 * prototype's heuristic. Promotion grants the 'mentor' capability and an
 * optional co_mentor clan membership.
 */
class PromotionService {
  async _enrich(candidate) {
    const row = await cohortService.buildMenteeRow(candidate.menteeId);
    const profile = await models.MenteeProfile.findOne({ where: { userId: candidate.menteeId }, attributes: ['personality'] });
    const p = profile?.personality || {};
    const resilience = p.resilience ?? 50;
    const communication = p.communication ?? 50;
    const consistency = p.consistency ?? 50;

    const readiness = row ? clamp(row.absoluteProgress * 0.45 + row.onTimeRate * 0.35 + resilience * 0.2) : 0;
    const willingness = clamp(communication * 0.65 + consistency * 0.35);

    return {
      id: candidate.id,
      menteeId: candidate.menteeId,
      stage: candidate.stage,
      motivation: candidate.motivation,
      strengths: candidate.strengths,
      availability: candidate.availability,
      decisionNote: candidate.decisionNote,
      targetClanId: candidate.targetClanId,
      name: row?.name || 'Mentee',
      avatar: row?.avatar || '?',
      program: row?.program || null,
      level: row?.level || null,
      absoluteProgress: row?.absoluteProgress ?? 0,
      onTimeRate: row?.onTimeRate ?? 0,
      readiness,
      willingness
    };
  }

  async list({ actorId, isAdmin }) {
    const where = isAdmin ? {} : { nominatedBy: actorId };
    const candidates = await models.PromotionCandidate.findAll({ where, order: [['created_at', 'DESC']] });
    return Promise.all(candidates.map((c) => this._enrich(c)));
  }

  async nominate(menteeId, mentorId) {
    if (!menteeId) throw new ValidationError('menteeId is required');
    const existing = await models.PromotionCandidate.findOne({
      where: { menteeId, stage: { [Op.ne]: 'promoted' } }
    });
    if (existing) throw new ConflictError('This mentee is already in the promotion pipeline');
    const candidate = await models.PromotionCandidate.create({ menteeId, nominatedBy: mentorId, stage: 'nominated' });
    return this._enrich(candidate);
  }

  async advance(id, data) {
    const candidate = await models.PromotionCandidate.findByPk(id);
    if (!candidate) throw new NotFoundError('Candidate not found');
    const order = ['nominated', 'interview', 'approved', 'promoted'];
    if (data.stage) {
      if (!order.includes(data.stage)) throw new ValidationError('Invalid stage');
      candidate.stage = data.stage;
    }
    ['motivation', 'strengths', 'availability', 'decisionNote', 'targetClanId'].forEach((k) => {
      if (data[k] !== undefined) candidate[k] = data[k];
    });
    await candidate.save();
    return this._enrich(candidate);
  }

  /** Final promotion (admin): grant mentor capability + optional co_mentor clan role. */
  async promote(id, { clanId } = {}) {
    const candidate = await models.PromotionCandidate.findByPk(id);
    if (!candidate) throw new NotFoundError('Candidate not found');

    const user = await models.User.findByPk(candidate.menteeId);
    if (!user) throw new NotFoundError('User not found');
    await clanService.ensureCapability(user, 'mentor');

    const targetClan = clanId || candidate.targetClanId;
    if (targetClan) {
      await clanService.addMember(targetClan, { userId: candidate.menteeId, role: 'co_mentor' });
      candidate.targetClanId = targetClan;
    }

    candidate.stage = 'promoted';
    await candidate.save();
    return this._enrich(candidate);
  }
}

module.exports = new PromotionService();
