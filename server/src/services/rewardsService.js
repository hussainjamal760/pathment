const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

/** Rewards: gift catalog + redemptions. */
class RewardsService {
  async overview() {
    const [gifts, redemptions] = await Promise.all([
      models.Gift.findAll({ where: { active: true }, order: [['created_at', 'DESC']] }),
      models.Redemption.findAll({
        order: [['created_at', 'DESC']],
        limit: 20,
        include: [
          { model: models.Gift, as: 'gift', attributes: ['name'] },
          { model: models.User, as: 'mentee', attributes: ['firstName', 'lastName'] }
        ]
      })
    ]);

    return {
      gifts: gifts.map((g) => ({ id: g.id, name: g.name, description: g.description, costXp: g.costXp, stock: g.stock })),
      redemptions: redemptions.map((r) => ({
        id: r.id,
        gift: r.gift?.name || 'Gift',
        mentee: fullName(r.mentee),
        costXp: r.costXp,
        at: r.createdAt
      }))
    };
  }

  async createGift(data, createdBy) {
    if (!data.name || !data.name.trim()) throw new ValidationError('name is required');
    return models.Gift.create({
      name: data.name.trim(),
      description: data.description || null,
      costXp: Number.isFinite(Number(data.costXp)) ? Number(data.costXp) : 0,
      stock: data.stock === null || data.stock === undefined || data.stock === '' ? null : Number(data.stock),
      active: true,
      createdBy
    });
  }

  async removeGift(id) {
    const g = await models.Gift.findByPk(id);
    if (!g) throw new NotFoundError('Gift not found');
    g.active = false;
    await g.save();
    return { removed: true };
  }

  async redeem(giftId, menteeId, redeemedBy) {
    if (!giftId || !menteeId) throw new ValidationError('giftId and menteeId are required');
    return sequelize.transaction(async (transaction) => {
      const gift = await models.Gift.findByPk(giftId, { transaction });
      if (!gift || !gift.active) throw new NotFoundError('Gift not available');
      if (gift.stock !== null) {
        if (gift.stock <= 0) throw new ValidationError('This gift is out of stock');
        gift.stock -= 1;
        await gift.save({ transaction });
      }
      return models.Redemption.create({ giftId, menteeId, redeemedBy, costXp: gift.costXp }, { transaction });
    });
  }
}

module.exports = new RewardsService();
