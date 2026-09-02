module.exports = (sequelize, DataTypes) => {
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

  return CertificateQueue;
};
