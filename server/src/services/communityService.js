const { Op } = require('sequelize');
const { models } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);
const initials = (u) => (u ? `${(u.firstName || '').charAt(0)}${(u.lastName || '').charAt(0)}`.toUpperCase() : '?');

/** Mentee cohort social feed + reactions. */
class CommunityService {
  async feed(userId) {
    const posts = await models.CommunityPost.findAll({
      order: [['created_at', 'DESC']],
      limit: 60,
      include: [
        { model: models.User, as: 'author', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.User, as: 'recipient', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.CommunityReaction, as: 'reactions', attributes: ['userId', 'type'] }
      ]
    });

    const mapped = posts.map((p) => {
      const reactions = p.reactions || [];
      const count = (t) => reactions.filter((r) => r.type === t).length;
      return {
        id: p.id,
        type: p.type,
        body: p.body,
        at: p.createdAt,
        author: { id: p.author?.id, name: fullName(p.author), avatar: initials(p.author) },
        recipient: p.recipient ? { id: p.recipient.id, name: fullName(p.recipient) } : null,
        reactions: { cheers: count('cheers'), helpful: count('helpful') },
        myReactions: reactions.filter((r) => r.userId === userId).map((r) => r.type),
        _toId: p.toId,
        _authorId: p.author?.id
      };
    });

    // Right-rail: shout-outs directed at me + my stats.
    const shoutouts = mapped.filter((p) => p.type === 'kudos' && p._toId === userId);
    const given = mapped.filter((p) => p.type === 'kudos' && p._authorId === userId).length;
    const cheersReceived = mapped
      .filter((p) => p._authorId === userId)
      .reduce((n, p) => n + p.reactions.cheers, 0);

    // strip internal fields
    const feed = mapped.map(({ _toId, _authorId, ...rest }) => rest);
    return {
      feed,
      shoutouts: shoutouts.map(({ _toId, _authorId, ...rest }) => rest),
      stats: { given, cheersReceived, posts: mapped.length }
    };
  }

  async createPost(authorId, { type, toId, body }) {
    if (!body || !body.trim()) throw new ValidationError('Say something');
    return models.CommunityPost.create({
      authorId,
      type: type || 'win',
      toId: type === 'kudos' ? (toId || null) : null,
      body: body.trim()
    });
  }

  async toggleReaction(postId, userId, type) {
    if (!['cheers', 'helpful'].includes(type)) throw new ValidationError('Invalid reaction type');
    const existing = await models.CommunityReaction.findOne({ where: { postId, userId, type } });
    if (existing) { await existing.destroy(); return { reacted: false }; }
    await models.CommunityReaction.create({ postId, userId, type });
    return { reacted: true };
  }

  /** Clanmates a mentee can give kudos to (other active members of their clans). */
  async getPeople(userId) {
    const myClans = await models.ClanMembership.findAll({
      where: { userId, status: 'active' }, attributes: ['clanId']
    });
    const clanIds = myClans.map((c) => c.clanId);
    if (!clanIds.length) return [];
    const memberships = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: clanIds }, status: 'active', userId: { [Op.ne]: userId } },
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
    });
    const seen = new Set();
    const people = [];
    memberships.forEach((m) => {
      if (m.user && !seen.has(m.user.id)) {
        seen.add(m.user.id);
        people.push({ id: m.user.id, name: fullName(m.user) });
      }
    });
    return people;
  }
}

module.exports = new CommunityService();
