module.exports = (sequelize, DataTypes) => {
  /**
   * InterviewSession - one attempt at an interview assignment. A mentee gets one
   * session per attempt; retake (when the mentor allowed it) creates a new session
   * with the next attempt_number. Holds status/timing and the proctor event log.
   */
  const InterviewSession = sequelize.define('InterviewSession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assigned_task_id'
    },
    interviewAssignmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'interview_assignment_id'
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    attemptNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'attempt_number'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'in_progress',
      validate: { isIn: [['in_progress', 'submitted']] }
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at'
    },
    // The question index the candidate is currently on — resume returns them here.
    currentPosition: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'current_position'
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'submitted_at'
    },
    // Array of proctor events { type, at, meta } — Phase 3 populates.
    proctorLog: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'proctor_log'
    },
    meta: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'interview_sessions',
    underscored: true,
    indexes: [
      { fields: ['assigned_task_id'] },
      { fields: ['mentee_id'] },
      { fields: ['status'] }
    ]
  });

  InterviewSession.associate = (models) => {
    InterviewSession.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'assignedTask' });
    InterviewSession.belongsTo(models.InterviewAssignment, { foreignKey: 'interview_assignment_id', as: 'assignment' });
    InterviewSession.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    InterviewSession.hasMany(models.InterviewAnswer, { foreignKey: 'session_id', as: 'answers' });
  };

  return InterviewSession;
};
