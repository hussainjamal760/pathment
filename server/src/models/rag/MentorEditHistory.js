module.exports = (sequelize, DataTypes) => {
  const MentorEditHistory = sequelize.define('MentorEditHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    messageDraftId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'draft_id'
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    originalContent: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'original_reply'
    },
    finalContent: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'edited_reply'
    },
    editDistance: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'edit_distance'
    },
    processed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'mentor_edit_histories',
    underscored: true
  });

  MentorEditHistory.associate = (models) => {
    MentorEditHistory.belongsTo(models.MessageDraft, { foreignKey: 'draft_id', as: 'draft' });
    MentorEditHistory.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return MentorEditHistory;
};
