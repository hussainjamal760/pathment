module.exports = (sequelize, DataTypes) => {
  /**
   * CommunityReaction - a user's reaction to a community post (cheers/helpful).
   * One row per (post, user, type) so counts are real and toggleable.
   */
  const CommunityReaction = sequelize.define('CommunityReaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'post_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [['cheers', 'celebrate', 'helpful', 'insightful']] }
    }
  }, {
    tableName: 'community_reactions',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['post_id', 'user_id', 'type'] },
      { fields: ['post_id'] }
    ]
  });

  CommunityReaction.associate = (models) => {
    CommunityReaction.belongsTo(models.CommunityPost, { foreignKey: 'post_id', as: 'post' });
  };

  return CommunityReaction;
};
