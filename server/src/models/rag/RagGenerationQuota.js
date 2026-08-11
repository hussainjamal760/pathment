module.exports = (sequelize, DataTypes) => {
  const RagGenerationQuota = sequelize.define('RagGenerationQuota', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'mentor_id'
    },
    count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    limit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100
    },
    windowStart: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'window_start'
    }
  }, {
    tableName: 'rag_generation_quotas',
    underscored: true
  });

  RagGenerationQuota.associate = (models) => {
    RagGenerationQuota.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return RagGenerationQuota;
};
