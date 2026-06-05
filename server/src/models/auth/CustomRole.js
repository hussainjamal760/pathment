module.exports = (sequelize, DataTypes) => {
  /**
   * CustomRole - an admin-defined permission bundle, layered on top of the
   * built-in roles (src/config/roles.js). Referenced by `key` from
   * role_assignments exactly like a built-in role. authzService merges these in.
   */
  const CustomRole = sequelize.define('CustomRole', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    key: {
      type: DataTypes.STRING(60),
      allowNull: false,
      unique: true
    },
    label: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    scopeLevel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'org',
      field: 'scope_level',
      validate: { isIn: [['org', 'program', 'clan', 'self']] }
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    }
  }, {
    tableName: 'custom_roles',
    underscored: true
  });

  return CustomRole;
};
