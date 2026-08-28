const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CertificateTemplate = sequelize.define('CertificateTemplate', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    bgImageUrl: { type: DataTypes.TEXT, field: 'bg_image_url' },
    logoUrl: { type: DataTypes.TEXT, field: 'logo_url' },
    logoConfig: { type: DataTypes.JSONB, field: 'logo_config' },
    config: { 
      type: DataTypes.JSONB, 
      allowNull: false 
    },
    goldBadgeUrl: { type: DataTypes.TEXT, field: 'gold_badge_url' },
    silverBadgeUrl: { type: DataTypes.TEXT, field: 'silver_badge_url' },
    bronzeBadgeUrl: { type: DataTypes.TEXT, field: 'bronze_badge_url' },
    participationBadgeUrl: { type: DataTypes.TEXT, field: 'participation_badge_url' },
    criteria: { type: DataTypes.JSONB },
    createdBy: { type: DataTypes.UUID, allowNull: false, field: 'created_by' },
    programId: { type: DataTypes.UUID, allowNull: false, field: 'program_id' },
    status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    aiEvaluation: { type: DataTypes.JSONB, field: 'ai_evaluation' },
    aiEvaluationRanAt: { type: DataTypes.DATE, field: 'ai_evaluation_ran_at' }
  }, { tableName: 'certificate_templates', underscored: true });

  CertificateTemplate.associate = function(models) {
    CertificateTemplate.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    CertificateTemplate.belongsTo(models.Program, { foreignKey: 'programId', as: 'program' });
  };

  const CertificateInstance = sequelize.define('CertificateInstance', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    templateId: { type: DataTypes.UUID, allowNull: false, field: 'template_id' },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    mentorId: { type: DataTypes.UUID, field: 'mentor_id' },
    issuedBy: { type: DataTypes.UUID, allowNull: false, field: 'issued_by' },
    pdfUrl: { type: DataTypes.TEXT, field: 'pdf_url' },
    imageUrl: { type: DataTypes.TEXT, field: 'image_url' },
    tier: { type: DataTypes.STRING(50), defaultValue: 'participation' },
    metadata: { type: DataTypes.JSONB }
  }, { tableName: 'certificate_instances', underscored: true });

  CertificateInstance.associate = function(models) {
    CertificateInstance.belongsTo(models.CertificateTemplate, { foreignKey: 'templateId', as: 'template' });
    CertificateInstance.belongsTo(models.User, { foreignKey: 'menteeId', as: 'mentee' });
    CertificateInstance.belongsTo(models.User, { foreignKey: 'mentorId', as: 'mentor' });
    CertificateInstance.belongsTo(models.User, { foreignKey: 'issuedBy', as: 'issuer' });
  };

  const CertificateQueue = sequelize.define('CertificateQueue', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
    status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    error: { type: DataTypes.TEXT },
    lockedAt: { type: DataTypes.DATE, field: 'locked_at' }
  }, { tableName: 'certificate_queue', underscored: true });

  CertificateQueue.associate = function(models) {
    CertificateQueue.belongsTo(models.CertificateInstance, { foreignKey: 'instanceId', as: 'instance' });
  };

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

  return { CertificateTemplate, CertificateInstance, CertificateQueue, AIEvaluationQueue };
};
