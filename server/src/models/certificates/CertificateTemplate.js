module.exports = (sequelize, DataTypes) => {
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

  return CertificateTemplate;
};
