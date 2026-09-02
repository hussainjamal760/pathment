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
