module.exports = (sequelize, DataTypes) => {
  /**
   * OrgPolicy - a single-row store for org-level authored content. Currently used
   * only for the Mentor Spec handbook (category `mentor_spec`); see mentorSpecService.
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
