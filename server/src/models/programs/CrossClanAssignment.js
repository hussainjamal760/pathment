module.exports = (sequelize, DataTypes) => {
  /**
   * CrossClanAssignment - a record that someone is helping across clans:
   * a mentor covering another clan, a specialist (e.g. psychologist) attached,
   * or co-mentee access. Lightweight record, not a workflow.
   */
  const CrossClanAssignment = sequelize.define('CrossClanAssignment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    kind: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'cover',
      validate: { isIn: [['cover', 'specialist', 'co_mentee_access']] }
    },
    userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
    fromClanId: { type: DataTypes.UUID, allowNull: true, field: 'from_clan_id' },
    toClanId: { type: DataTypes.UUID, allowNull: true, field: 'to_clan_id' },
    note: { type: DataTypes.TEXT, allowNull: true },
    // Consent-first: a lead's request stays `pending` until the person accepts;
    // admin-created cover is `active` immediately. Only `active` grants access.
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      validate: { isIn: [['pending', 'active', 'declined']] }
    },
    respondedAt: { type: DataTypes.DATE, allowNull: true, field: 'responded_at' },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'cross_clan_assignments',
    underscored: true,
    timestamps: true
  });

  CrossClanAssignment.associate = (models) => {
    CrossClanAssignment.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    CrossClanAssignment.belongsTo(models.Clan, { foreignKey: 'from_clan_id', as: 'fromClan' });
    CrossClanAssignment.belongsTo(models.Clan, { foreignKey: 'to_clan_id', as: 'toClan' });
  };

  return CrossClanAssignment;
};
