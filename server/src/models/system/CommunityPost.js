module.exports = (sequelize, DataTypes) => {
  /**
   * CommunityPost — a cohort social post: kudos (optionally to someone), a win,
   * a question, or a meme. Reactions live in CommunityReaction.
   */
  const CommunityPost = sequelize.define('CommunityPost', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id'
    },
    // Recipient for a kudos post (optional).
    toId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'to_id'
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'win',
      validate: { isIn: [['kudos', 'win', 'question', 'meme']] }
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'community_posts',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['author_id'] },
      { fields: ['to_id'] },
      { fields: ['type'] }
    ]
  });

  CommunityPost.associate = (models) => {
    CommunityPost.belongsTo(models.User, { foreignKey: 'author_id', as: 'author' });
    CommunityPost.belongsTo(models.User, { foreignKey: 'to_id', as: 'recipient' });
    CommunityPost.hasMany(models.CommunityReaction, { foreignKey: 'post_id', as: 'reactions' });
  };

  return CommunityPost;
};
