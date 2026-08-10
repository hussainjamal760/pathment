module.exports = (sequelize, DataTypes) => {
  const MentorDocument = sequelize.define('MentorDocument', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'file_name'
    },
    fileUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'file_url'
    },
    cloudinaryPublicId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'cloudinary_public_id'
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'processing' // processing, completed, failed
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message'
    }
  }, {
    tableName: 'mentor_documents',
    underscored: true
  });

  MentorDocument.associate = (models) => {
    if (models.User) {
      MentorDocument.belongsTo(models.User, { foreignKey: 'mentorId', as: 'mentor' });
    }
  };

  return MentorDocument;
};
