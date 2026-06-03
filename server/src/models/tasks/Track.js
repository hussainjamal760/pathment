module.exports = (sequelize, DataTypes) => {
  /**
   * Track — a lightweight personal lane for one mentee (e.g. "Frontend",
   * "Soft skills"). Tasks belong to a track via AssignedTask.trackId; the
   * mentee's This-Week view groups by track and the mentor curates lanes
   * from the mentee profile. Archiving hides a lane without deleting history.
   */
  const Track = sequelize.define('Track', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    name: { type: DataTypes.STRING(120), allowNull: false },
    color: { type: DataTypes.STRING(20), allowNull: true },
    source: {
      type: DataTypes.STRING(12),
      allowNull: false,
      defaultValue: 'blank',
      validate: { isIn: [['blank', 'template', 'program']] }
    },
    archived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'order_index' },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'tracks',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['mentee_id'] }, { fields: ['mentee_id', 'archived'] }]
  });

  Track.associate = (models) => {
    Track.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    Track.hasMany(models.AssignedTask, { foreignKey: 'track_id', as: 'tasks' });
  };

  return Track;
};
