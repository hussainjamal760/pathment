module.exports = (sequelize, DataTypes) => {
  /**
   * Collaborator — a specialist (psychologist, career coach, guest mentor,
   * domain expert) invited to work with a mentee. Anything they contribute is
   * attributed to them. Free-form name/role so external specialists who aren't
   * platform users can still be represented.
   */
  const Collaborator = sequelize.define('Collaborator', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    role: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'invited',
      validate: { isIn: [['invited', 'active']] }
    },
    invitedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'invited_by'
    }
  }, {
    tableName: 'collaborators',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id'] }
    ]
  });

  Collaborator.associate = (models) => {
    Collaborator.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    Collaborator.belongsTo(models.User, { foreignKey: 'invited_by', as: 'inviter' });
    models.User.hasMany(Collaborator, { foreignKey: 'mentee_id', as: 'collaborators' });
  };

  return Collaborator;
};
