module.exports = (sequelize, DataTypes) => {
  /**
   * PromotionCandidate — a mentee nominated to become a co-mentor. Moves
   * nominated → interview → approved → promoted. Promotion grants the user the
   * 'mentor' platform capability and (optionally) a co_mentor ClanMembership.
   */
  const PromotionCandidate = sequelize.define('PromotionCandidate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    nominatedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'nominated_by'
    },
    stage: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'nominated',
      validate: { isIn: [['nominated', 'interview', 'approved', 'promoted']] }
    },
    motivation: { type: DataTypes.TEXT, allowNull: true },
    strengths: { type: DataTypes.TEXT, allowNull: true },
    availability: { type: DataTypes.STRING(120), allowNull: true },
    decisionNote: { type: DataTypes.TEXT, allowNull: true, field: 'decision_note' },
    targetClanId: { type: DataTypes.UUID, allowNull: true, field: 'target_clan_id' }
  }, {
    tableName: 'promotion_candidates',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['nominated_by'] },
      { fields: ['stage'] }
    ]
  });

  PromotionCandidate.associate = (models) => {
    PromotionCandidate.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    PromotionCandidate.belongsTo(models.User, { foreignKey: 'nominated_by', as: 'nominator' });
  };

  return PromotionCandidate;
};
