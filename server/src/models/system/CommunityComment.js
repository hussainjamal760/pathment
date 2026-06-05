module.exports = (sequelize, DataTypes) => {
  /**
   * CommunityComment - a reply on a CommunityPost. Supports one level of
   * threading via parentId (a reply to a reply still attaches to the same
   * post, with parentId pointing at the comment it answers). A question post's
   * accepted answer is a comment referenced by CommunityPost.acceptedCommentId.
   */
  const CommunityComment = sequelize.define('CommunityComment', {
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
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id'
    },
    // Parent comment for threaded replies (null = top-level answer).
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_id'
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    mentionedUserIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: false,
      defaultValue: [],
      field: 'mentioned_user_ids'
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'edited_at'
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at'
    }
  }, {
    tableName: 'community_comments',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['post_id'] },
      { fields: ['author_id'] },
      { fields: ['parent_id'] }
    ]
  });

  CommunityComment.associate = (models) => {
    CommunityComment.belongsTo(models.CommunityPost, { foreignKey: 'post_id', as: 'post' });
    CommunityComment.belongsTo(models.User, { foreignKey: 'author_id', as: 'author' });
    CommunityComment.belongsTo(models.CommunityComment, { foreignKey: 'parent_id', as: 'parent' });
  };

  return CommunityComment;
};
