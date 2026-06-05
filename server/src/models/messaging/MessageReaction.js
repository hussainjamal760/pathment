module.exports = (sequelize, DataTypes) => {
  /**
   * MessageReaction - a user's emoji reaction to a chat message. One row per
   * (message, user) so each person has a single reaction they can change or
   * remove (WhatsApp-style toggle).
   */
  const MessageReaction = sequelize.define('MessageReaction', {
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
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    emoji: {
      type: DataTypes.STRING(16),
      allowNull: false
    }
  }, {
    tableName: 'message_reactions',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['message_id', 'user_id'] },
      { fields: ['message_id'] }
    ]
  });

  MessageReaction.associate = (models) => {
    MessageReaction.belongsTo(models.Message, { foreignKey: 'message_id', as: 'message' });
    MessageReaction.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return MessageReaction;
};
