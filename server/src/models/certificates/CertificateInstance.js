module.exports = (sequelize, DataTypes) => {
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

  return CertificateInstance;
};
