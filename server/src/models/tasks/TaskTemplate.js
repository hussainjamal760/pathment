module.exports = (sequelize, DataTypes) => {
  const TaskTemplate = sequelize.define('TaskTemplate', {
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
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'custom',
      validate: {
        isIn: [['reading', 'video', 'exercise', 'project', 'quiz', 'discussion', 'practical', 'assessment', 'custom']]
      }
    },
    difficulty: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
      validate: {
        isIn: [['easy', 'medium', 'hard', 'expert']]
      }
    },
    deliverable: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    acceptanceCriteria: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      field: 'acceptance_criteria'
    },
    estimatedHours: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      field: 'estimated_hours'
    },
    pointsBase: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
      field: 'points_base'
    }
  }, {
    tableName: 'task_templates',
    underscored: true,
    indexes: [
      { fields: ['mentor_id'] }
    ]
  });

  TaskTemplate.associate = (models) => {
    TaskTemplate.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return TaskTemplate;
};
