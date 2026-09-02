module.exports = (sequelize, DataTypes) => {
  const AIEvaluationQueue = sequelize.define('AIEvaluationQueue', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    runId: { type: DataTypes.UUID, allowNull: false, field: 'run_id' },
    templateId: { type: DataTypes.UUID, allowNull: false, field: 'template_id' },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    triggeredBy: { type: DataTypes.UUID, allowNull: false, field: 'triggered_by' },
    status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
    menteePayload: { type: DataTypes.JSONB, allowNull: false, field: 'mentee_payload' },
    preCheck: { type: DataTypes.JSONB, field: 'pre_check' },
    result: { type: DataTypes.JSONB },
    error: { type: DataTypes.TEXT },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, defaultValue: 3, field: 'max_attempts' },
    lockedAt: { type: DataTypes.DATE, field: 'locked_at' }
  }, { tableName: 'ai_evaluation_queue', underscored: true });

  AIEvaluationQueue.associate = function(models) {
    AIEvaluationQueue.belongsTo(models.CertificateTemplate, { foreignKey: 'templateId', as: 'template' });
    AIEvaluationQueue.belongsTo(models.User, { foreignKey: 'menteeId', as: 'mentee' });
    AIEvaluationQueue.belongsTo(models.User, { foreignKey: 'triggeredBy', as: 'triggerer' });
  };

  return AIEvaluationQueue;
};
