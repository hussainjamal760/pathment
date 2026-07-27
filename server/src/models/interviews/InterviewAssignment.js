module.exports = (sequelize, DataTypes) => {
  /**
   * InterviewAssignment - 1:1 with an `assigned_task` of type 'interview'. It
   * links the assignment to its kit and snapshots the options the mentor chose at
   * assign time (retake allowed?, camera required?, AI grading?, timing) so later
   * kit edits don't silently change the rules of an assignment already out.
   */
  const InterviewAssignment = sequelize.define('InterviewAssignment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'assigned_task_id'
    },
    kitId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'kit_id'
    },
    allowRetake: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'allow_retake'
    },
    cameraRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'camera_required'
    },
    aiGradingEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'ai_grading_enabled'
    },
    timingMode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'per_question',
      field: 'timing_mode',
      validate: { isIn: [['per_question', 'total']] }
    },
    totalSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'total_seconds'
    }
  }, {
    tableName: 'interview_assignments',
    underscored: true,
    indexes: [
      { fields: ['assigned_task_id'], unique: true },
      { fields: ['kit_id'] }
    ]
  });

  InterviewAssignment.associate = (models) => {
    InterviewAssignment.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'assignedTask' });
    InterviewAssignment.belongsTo(models.InterviewKit, { foreignKey: 'kit_id', as: 'kit' });
  };

  return InterviewAssignment;
};
