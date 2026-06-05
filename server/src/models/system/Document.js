module.exports = (sequelize, DataTypes) => {
  /**
   * Document - an org-shared library item (mentorship guidance, reading,
   * templates, policies) all mentors can see.
   */
  const Document = sequelize.define('Document', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    category: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'guidance',
      validate: { isIn: [['guidance', 'reading', 'template', 'policy']] }
    },
    summary: { type: DataTypes.TEXT, allowNull: true },
    // Rich-text article body (HTML from the editor). Optional - an item can be a
    // written article, an external link (url), or both.
    content: { type: DataTypes.TEXT, allowNull: true },
    author: { type: DataTypes.STRING(150), allowNull: true },
    url: { type: DataTypes.TEXT, allowNull: true },
    readMins: { type: DataTypes.INTEGER, allowNull: true, field: 'read_mins' },
    pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'documents',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['category'] }, { fields: ['pinned'] }]
  });

  return Document;
};
