module.exports = (sequelize, DataTypes) => {
  /**
   * RoadmapLink - a directed edge in the roadmap chain graph: "after
   * from_roadmap, the next is to_roadmap". One outgoing edge = a linear chain
   * (auto-advances on completion); several = a branch the mentor picks from.
   * Authored once on the roadmaps and reused for everyone assigned. Kept acyclic
   * (DAG) by validating at author time.
   */
  const RoadmapLink = sequelize.define('RoadmapLink', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    fromRoadmapId: { type: DataTypes.UUID, allowNull: false, field: 'from_roadmap_id' },
    toRoadmapId: { type: DataTypes.UUID, allowNull: false, field: 'to_roadmap_id' },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Optional gate for branching later (e.g. { minScore: 70 }). Null = always.
    condition: { type: DataTypes.JSONB, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
  }, {
    tableName: 'roadmap_links',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['from_roadmap_id', 'to_roadmap_id'] },
      { fields: ['from_roadmap_id'] },
    ],
  });

  RoadmapLink.associate = (models) => {
    RoadmapLink.belongsTo(models.Roadmap, { foreignKey: 'from_roadmap_id', as: 'fromRoadmap' });
    RoadmapLink.belongsTo(models.Roadmap, { foreignKey: 'to_roadmap_id', as: 'toRoadmap' });
  };

  return RoadmapLink;
};
