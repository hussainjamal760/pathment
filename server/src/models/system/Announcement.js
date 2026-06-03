module.exports = (sequelize, DataTypes) => {
  /**
   * Announcement — an org broadcast (one source of truth, replacing scattered
   * threads). Audience is 'all' or a specific programId. Can be pinned.
   */
  const Announcement = sequelize.define('Announcement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id'
    },
    // 'all' or a programId.
    audience: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'all'
    },
    pinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'announcements',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['audience'] },
      { fields: ['pinned'] }
    ]
  });

  Announcement.associate = (models) => {
    Announcement.belongsTo(models.User, { foreignKey: 'author_id', as: 'author' });
    Announcement.hasMany(models.AnnouncementReaction, { foreignKey: 'announcement_id', as: 'reactions' });
  };

  return Announcement;
};
