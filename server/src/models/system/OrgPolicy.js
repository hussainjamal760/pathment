module.exports = (sequelize, DataTypes) => {
  /**
   * OrgPolicy — an organization policy (e.g. clan-change cooldown, capacity
   * rules) shown in the admin ClanRequests area.
   */
  const OrgPolicy = sequelize.define('OrgPolicy', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    category: { type: DataTypes.STRING(60), allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'org_policies',
    underscored: true,
    timestamps: true
  });

  return OrgPolicy;
};
