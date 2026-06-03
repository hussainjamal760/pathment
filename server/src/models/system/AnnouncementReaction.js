module.exports = (sequelize, DataTypes) => {
  /**
   * AnnouncementReaction — a user's reaction to an announcement (acknowledged
   * or helpful). One row per (announcement, user, type) so counts are real and
   * each user can toggle their own.
   */
  const AnnouncementReaction = sequelize.define('AnnouncementReaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    announcementId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'announcement_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [['acknowledged', 'helpful']] }
    }
  }, {
    tableName: 'announcement_reactions',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['announcement_id', 'user_id', 'type'] },
      { fields: ['announcement_id'] }
    ]
  });

  AnnouncementReaction.associate = (models) => {
    AnnouncementReaction.belongsTo(models.Announcement, { foreignKey: 'announcement_id', as: 'announcement' });
  };

  return AnnouncementReaction;
};
