module.exports = (sequelize, DataTypes) => {
  /**
   * Redemption — a gift redeemed for a mentee by a mentor/admin. costXp is
   * snapshotted at redemption time.
   */
  const Redemption = sequelize.define('Redemption', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    giftId: { type: DataTypes.UUID, allowNull: false, field: 'gift_id' },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    redeemedBy: { type: DataTypes.UUID, allowNull: true, field: 'redeemed_by' },
    costXp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'cost_xp' }
  }, {
    tableName: 'redemptions',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['gift_id'] }, { fields: ['mentee_id'] }]
  });

  Redemption.associate = (models) => {
    Redemption.belongsTo(models.Gift, { foreignKey: 'gift_id', as: 'gift' });
    Redemption.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
  };

  return Redemption;
};
