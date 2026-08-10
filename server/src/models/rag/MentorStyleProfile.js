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
      defaultValue: {}
    },
    vocabulary: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    customInstructions: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'custom_instructions'
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
