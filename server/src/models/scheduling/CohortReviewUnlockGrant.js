module.exports = (sequelize, DataTypes) => {
  /**
   * CohortReviewUnlockGrant - a time-boxed permission an admin issues so a
   * mentor can delete/reopen review sessions while the org deletion lock is ON.
   * A grant is "active" when it has not been revoked and has not yet expired.
   */
  const CohortReviewUnlockGrant = sequelize.define('CohortReviewUnlockGrant', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    grantedBy: { type: DataTypes.UUID, allowNull: true, field: 'granted_by' },
    requestId: { type: DataTypes.UUID, allowNull: true, field: 'request_id' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
  }, {
    tableName: 'cohort_review_unlock_grants',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['mentor_id'] }, { fields: ['expires_at'] }],
  });

  CohortReviewUnlockGrant.associate = (models) => {
    CohortReviewUnlockGrant.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    CohortReviewUnlockGrant.belongsTo(models.User, { foreignKey: 'granted_by', as: 'granter' });
    CohortReviewUnlockGrant.belongsTo(models.CohortReviewUnlockRequest, { foreignKey: 'request_id', as: 'request' });
  };

  return CohortReviewUnlockGrant;
};
