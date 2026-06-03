module.exports = (sequelize, DataTypes) => {
  /**
   * Gift — a redeemable item in the rewards catalog (swag, course credit, a
   * 1:1, a conference ticket…). costXp is the headline price; stock null = ∞.
   */
  const Gift = sequelize.define('Gift', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    costXp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'cost_xp' },
    stock: { type: DataTypes.INTEGER, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'gifts',
    underscored: true,
    timestamps: true
  });

  Gift.associate = (models) => {
    Gift.hasMany(models.Redemption, { foreignKey: 'gift_id', as: 'redemptions' });
  };

  return Gift;
};
