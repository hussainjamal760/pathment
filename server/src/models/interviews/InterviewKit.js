module.exports = (sequelize, DataTypes) => {
  /**
   * InterviewKit - a reusable structured interview: an ordered set of questions a
   * mentor authors once and assigns to many mentees as an `interview` task. The
   * candidate answers by voice / code / text (Phase 2 runner); the mentor grades
   * it (source of truth), with optional BYO-AI drafting.
   */
  const InterviewKit = sequelize.define('InterviewKit', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by'
    },
    // Optional reuse scoping — a program's mentors share the kit. Null = personal.
    programId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'program_id'
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clan_id'
    },
    // 'per_question' → each question carries its own timer; 'total' → a single
    // clock for the whole interview (total_seconds).
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
    },
    // Defaults the assign drawer pre-fills; each is overridable per assignment.
    cameraDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'camera_default'
    },
    aiGradingDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'ai_grading_default'
    },
    allowRetakeDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'allow_retake_default'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
      validate: { isIn: [['draft', 'published', 'archived']] }
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'interview_kits',
    underscored: true,
    indexes: [
      { fields: ['created_by'] },
      { fields: ['program_id'] },
      { fields: ['status'] }
    ]
  });

  InterviewKit.associate = (models) => {
    InterviewKit.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    InterviewKit.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    InterviewKit.hasMany(models.InterviewQuestion, { foreignKey: 'kit_id', as: 'questions' });
    InterviewKit.hasMany(models.InterviewAssignment, { foreignKey: 'kit_id', as: 'assignments' });
  };

  return InterviewKit;
};
