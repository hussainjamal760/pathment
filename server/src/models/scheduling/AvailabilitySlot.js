module.exports = (sequelize, DataTypes) => {
  /**
   * AvailabilitySlot — a Calendly-style bookable slot a mentor publishes.
   * A mentee books one and it becomes a ScheduledMeeting.
   */
  const AvailabilitySlot = sequelize.define('AvailabilitySlot', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    // Human-friendly day label or date, e.g. 'Mon' or 'Thu, May 29'.
    day: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    time: {
      type: DataTypes.STRING(20),
      allowNull: false // e.g. '2:00 PM'
    },
    durationMins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'duration_mins'
    },
    taken: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    takenBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'taken_by'
    }
  }, {
    tableName: 'availability_slots',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentor_id'] },
      { fields: ['taken'] }
    ]
  });

  AvailabilitySlot.associate = (models) => {
    AvailabilitySlot.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    AvailabilitySlot.belongsTo(models.User, { foreignKey: 'taken_by', as: 'bookedBy' });
  };

  return AvailabilitySlot;
};
