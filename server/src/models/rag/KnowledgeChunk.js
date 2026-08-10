module.exports = (sequelize, DataTypes) => {
  const KnowledgeChunk = sequelize.define('KnowledgeChunk', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    sourceType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'source_type'
    },
    sourceId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'source_id'
    },
    sourceVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'source_version'
    },
    chunkIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'chunk_index'
    },
    contentHash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
      field: 'content_hash'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    embedding: {
      type: 'VECTOR(1536)',
      allowNull: true
    },
    searchVector: {
      type: 'TSVECTOR',
      allowNull: true,
      field: 'search_vector'
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'mentor_id'
    },
    programId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'program_id'
    },
    visibility: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'public'
    },
    unlockedRoadmapNodeIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'unlocked_roadmap_node_ids'
    }
  }, {
    tableName: 'knowledge_chunks',
    underscored: true
  });

  return KnowledgeChunk;
};
