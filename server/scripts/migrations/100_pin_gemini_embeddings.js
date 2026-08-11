const { sequelize } = require('../../src/db');
const logger = require('../../src/utils/ragLogger');

module.exports = {
  up: async () => {
    console.log('▶ Running migration 096: Pin embedding dimensions to 768 for Gemini');
    try {
      await sequelize.transaction(async (t) => {
        // 1. Drop the existing HNSW index
        await sequelize.query('DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;', { transaction: t });

        // 2. Clear existing embeddings (since they are 1536 dimensions and cannot cast to 768)
        console.log('  ⚠️ Clearing existing 1536-dimensional embeddings to prepare for Gemini 768-dim backfill.');
        await sequelize.query('UPDATE knowledge_chunks SET embedding = NULL;', { transaction: t });

        // 3. Alter the column type to vector(768)
        await sequelize.query('ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(768);', { transaction: t });

        // 4. Recreate the HNSW index for the new dimension
        await sequelize.query('CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);', { transaction: t });
      });
      console.log('✅ Migration 096 complete');
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  },

  down: async () => {
    console.log('◀ Rolling back migration 096: Reverting embeddings to 1536 dimensions');
    try {
      await sequelize.transaction(async (t) => {
        await sequelize.query('DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;', { transaction: t });
        await sequelize.query('UPDATE knowledge_chunks SET embedding = NULL;', { transaction: t });
        await sequelize.query('ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1536);', { transaction: t });
        await sequelize.query('CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);', { transaction: t });
      });
      console.log('✅ Rollback 096 complete');
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      throw error;
    }
  }
};
