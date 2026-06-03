module.exports = (sequelize, DataTypes) => {
  const TaskFeedback = sequelize.define('TaskFeedback', {
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
    submissionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'submission_id'
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    feedbackText: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'feedback_text'
    },
    inlineFeedback: {
      type: DataTypes.JSONB,
      field: 'inline_feedback',
      comment: 'Array of {line, comment, type} for inline feedback'
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      validate: { min: 0, max: 5 }
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'is_approved'
    },
    revisionNotes: {
      type: DataTypes.TEXT,
      field: 'revision_notes'
    },
    criteriaMet: {
      type: DataTypes.JSONB,
      field: 'criteria_met'
    },
    // The explicit review decision (4-decision model). isApproved is kept in
    // sync (approved/approved_notes => true; changes/rejected => false) for
    // backward compatibility with existing consumers.
    decision: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['approved', 'approved_notes', 'changes', 'rejected']]
      }
    },
    // Labels of the acceptance criteria the mentor ticked during review.
    checkedCriteria: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'checked_criteria'
    },
    feedbackType: {
      type: DataTypes.STRING(20),
      defaultValue: 'general',
      field: 'feedback_type',
      validate: {
        isIn: [['general', 'inline', 'both']]
      }
    }
  }, {
    tableName: 'task_feedback',
    underscored: true,
    indexes: [
      { fields: ['assigned_task_id'] },
      { fields: ['submission_id'] },
      { fields: ['mentor_id'] }
    ]
  });

  TaskFeedback.associate = (models) => {
    TaskFeedback.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'assignedTask' });
    TaskFeedback.belongsTo(models.TaskSubmission, { foreignKey: 'submission_id', as: 'submission' });
    TaskFeedback.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return TaskFeedback;
};
