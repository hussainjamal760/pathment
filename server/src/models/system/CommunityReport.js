module.exports = (sequelize, DataTypes) => {
  /**
   * CommunityReport - a member flags a post or comment for moderator (mentor /
   * admin) attention. Polymorphic over post|comment via targetType/targetId.
   */
  const CommunityReport = sequelize.define('CommunityReport', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    targetType: {
      type: DataTypes.STRING(10),
      allowNull: false,
      field: 'target_type',
      validate: { isIn: [['post', 'comment']] }
    },
    targetId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'target_id'
    },
    reporterId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'reporter_id'
    },
    reason: {
      type: DataTypes.TEXT
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'open',
      validate: { isIn: [['open', 'reviewed', 'dismissed']] }
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewed_by'
    }
  }, {
    tableName: 'community_reports',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['target_type', 'target_id'] },
      { fields: ['status'] }
    ]
  });

  CommunityReport.associate = (models) => {
    CommunityReport.belongsTo(models.User, { foreignKey: 'reporter_id', as: 'reporter' });
  };

  return CommunityReport;
};
