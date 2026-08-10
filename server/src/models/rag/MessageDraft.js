module.exports = (sequelize, DataTypes) => {
  const MessageDraft = sequelize.define('MessageDraft', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'message_id'
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    draftContent: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'draft_reply'
    },
    confidenceScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'confidence_score'
    },
    groundingScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'grounding_score'
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'pending' // pending, approved, discarded
    },
    retrievedChunkIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'retrieved_chunk_ids'
    },
    unsupportedSpans: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'unsupported_spans'
    }
  }, {
    tableName: 'message_drafts',
    underscored: true
  });

  MessageDraft.associate = (models) => {
    MessageDraft.belongsTo(models.Message, { foreignKey: 'message_id', as: 'originalMessage' });
    MessageDraft.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    MessageDraft.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
  };

  return MessageDraft;
};
