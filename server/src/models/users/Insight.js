module.exports = (sequelize, DataTypes) => {
  /**
   * Insight — a mentor-logged observation about a mentee (outside the review
   * flow), captured from 1:1s, text syncs, or observation. Feeds the mentee's
   * insight timeline (personality / analytical / issue / strength / general).
   */
  const Insight = sequelize.define('Insight', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'general',
      validate: { isIn: [['personality', 'analytical', 'issue', 'strength', 'general']] }
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    source: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: { isIn: [['1:1', 'text', 'observation']] }
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    }
  }, {
    tableName: 'insights',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['kind'] }
    ]
  });

  Insight.associate = (models) => {
    Insight.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    Insight.belongsTo(models.User, { foreignKey: 'created_by', as: 'author' });
    models.User.hasMany(Insight, { foreignKey: 'mentee_id', as: 'insights' });
  };

  return Insight;
};
