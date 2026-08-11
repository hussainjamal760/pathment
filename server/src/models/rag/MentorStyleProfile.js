module.exports = (sequelize, DataTypes) => {
  const MentorStyleProfile = sequelize.define('MentorStyleProfile', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'mentor_id'
    },
    tone: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: { brevity: 0.5, formality: 0.5 }
    },
    vocabulary: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    vocabularyPreferences: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'vocabulary_preferences'
    },
    phrasePatterns: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'phrase_patterns'
    },
    styleExamples: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'style_examples'
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    customInstructions: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'custom_instructions'
    },
    autoReplyEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'auto_reply_enabled'
    }
  }, {
    tableName: 'mentor_style_profiles',
    underscored: true
  });

  MentorStyleProfile.associate = (models) => {
    MentorStyleProfile.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return MentorStyleProfile;
};
