module.exports = (sequelize, DataTypes) => {
  /**
   * CohortReviewUnlockRequest - a mentor's ask to be allowed to delete/reopen a
   * cohort review session while the org-wide deletion lock is ON. An admin
   * approves it (minting a grant) or declines it. One pending request per mentor
   * at a time (enforced in the service).
   */
  const CohortReviewUnlockRequest = sequelize.define('CohortReviewUnlockRequest', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    sessionId: { type: DataTypes.UUID, allowNull: true, field: 'session_id' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending',
      validate: { isIn: [['pending', 'approved', 'declined', 'cancelled']] },
    },
    reviewedBy: { type: DataTypes.UUID, allowNull: true, field: 'reviewed_by' },
    reviewedAt: { type: DataTypes.DATE, allowNull: true, field: 'reviewed_at' },
    decisionNote: { type: DataTypes.TEXT, allowNull: true, field: 'decision_note' },
  }, {
    tableName: 'cohort_review_unlock_requests',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['mentor_id'] }, { fields: ['status'] }],
  });

  CohortReviewUnlockRequest.associate = (models) => {
    CohortReviewUnlockRequest.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    CohortReviewUnlockRequest.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
    CohortReviewUnlockRequest.belongsTo(models.CohortReviewSession, { foreignKey: 'session_id', as: 'session' });
  };

  return CohortReviewUnlockRequest;
};
