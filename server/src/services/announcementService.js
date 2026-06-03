const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

/** Org announcements + per-user reactions. */
class AnnouncementService {
  async list(userId, { audience } = {}) {
    const where = {};
    if (audience && audience !== 'all') where.audience = audience;

    const announcements = await models.Announcement.findAll({
      where,
      include: [
        { model: models.User, as: 'author', attributes: ['firstName', 'lastName', 'role'] },
        { model: models.AnnouncementReaction, as: 'reactions', attributes: ['userId', 'type'] }
      ],
      order: [['pinned', 'DESC'], ['created_at', 'DESC']]
    });

    // Resolve program names for audience labels.
    const programIds = [...new Set(announcements.map((a) => a.audience).filter((x) => x && x !== 'all'))];
    const programs = programIds.length
      ? await models.Program.findAll({ where: { id: programIds }, attributes: ['id', 'name'] })
      : [];
    const programName = Object.fromEntries(programs.map((p) => [p.id, p.name]));

    return announcements.map((a) => {
      const reactions = a.reactions || [];
      const count = (t) => reactions.filter((r) => r.type === t).length;
      const mine = reactions.filter((r) => r.userId === userId).map((r) => r.type);
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        audienceLabel: a.audience === 'all' ? 'All programs' : (programName[a.audience] || 'Program'),
        pinned: a.pinned,
        at: a.createdAt,
        author: a.author ? { name: `${a.author.firstName} ${a.author.lastName}`.trim(), role: a.author.role } : null,
        reactions: { acknowledged: count('acknowledged'), helpful: count('helpful') },
        myReactions: mine
      };
    });
  }

  async create({ title, body, audience }, authorId) {
    if (!title || !title.trim() || !body || !body.trim()) throw new ValidationError('title and body are required');
    return models.Announcement.create({
      title: title.trim(),
      body: body.trim(),
      audience: audience || 'all',
      pinned: false,
      authorId
    });
  }

  async togglePin(id) {
    const a = await models.Announcement.findByPk(id);
    if (!a) throw new NotFoundError('Announcement not found');
    a.pinned = !a.pinned;
    await a.save();
    return a;
  }

  async toggleReaction(id, userId, type) {
    if (!['acknowledged', 'helpful'].includes(type)) throw new ValidationError('Invalid reaction type');
    const existing = await models.AnnouncementReaction.findOne({ where: { announcementId: id, userId, type } });
    if (existing) { await existing.destroy(); return { reacted: false }; }
    await models.AnnouncementReaction.create({ announcementId: id, userId, type });
    return { reacted: true };
  }

  async remove(id) {
    const a = await models.Announcement.findByPk(id);
    if (!a) throw new NotFoundError('Announcement not found');
    await models.AnnouncementReaction.destroy({ where: { announcementId: id } });
    await a.destroy();
    return { removed: true };
  }
}

module.exports = new AnnouncementService();
