module.exports = (sequelize, DataTypes) => {
  /**
   * RoleAssignment - a user holds `role` at a `scope`. The persisted half of
   * scoped RBAC (most assignments are still derived at request time from
   * capabilities + clan memberships; this lets admins grant scoped roles
   * explicitly). See src/services/authzService.js + src/config/roles.js.
   */
  const RoleAssignment = sequelize.define('RoleAssignment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    role: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    scopeType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'org',
      field: 'scope_type',
      validate: { isIn: [['org', 'program', 'clan', 'self']] }
    },
    scopeId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'scope_id'
    },
    grantedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'granted_by'
    }
  }, {
    tableName: 'role_assignments',
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['scope_type', 'scope_id'] },
      { unique: true, fields: ['user_id', 'role', 'scope_type', 'scope_id'] }
    ]
  });

  RoleAssignment.associate = (models) => {
    RoleAssignment.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    RoleAssignment.belongsTo(models.User, { foreignKey: 'granted_by', as: 'grantedByUser' });
  };

  return RoleAssignment;
};
