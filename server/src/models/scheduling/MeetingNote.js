module.exports = (sequelize, DataTypes) => {
  /**
   * MeetingNote — a logged 1:1 (or standup/review/pairing) record: what was
   * discussed, the read on sentiment, issues raised, and next steps. Shows on
   * the mentee profile's 1:1 timeline. Standalone (may or may not link to a
   * booked ScheduledMeeting).
   */
  const MeetingNote = sequelize.define('MeetingNote', {
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
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    scheduledMeetingId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'scheduled_meeting_id'
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '1:1',
      validate: { isIn: [['1:1', 'standup', 'review', 'pairing']] }
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    sentiment: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'neutral',
      validate: { isIn: [['positive', 'neutral', 'low']] }
    },
    issues: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: []
    },
    nextSteps: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: 'next_steps'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    }
  }, {
    tableName: 'meeting_notes',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['mentor_id'] }
    ]
  });

  MeetingNote.associate = (models) => {
    MeetingNote.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    MeetingNote.belongsTo(models.User, { foreignKey: 'created_by', as: 'author' });
    models.User.hasMany(MeetingNote, { foreignKey: 'mentee_id', as: 'meetingNotes' });
  };

  return MeetingNote;
};
