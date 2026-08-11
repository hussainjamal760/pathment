/**
 * Migration: 095_generated_search_vector
 *
 * Converts knowledge_chunks.search_vector into a PostgreSQL generated column
 * so it is always correct regardless of what the INSERT statement includes.
 *
 * Run:      node server/scripts/migrations/095_generated_search_vector.js
 * Rollback: node server/scripts/migrations/095_generated_search_vector.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  console.log('▶ Running migration 095: Generated search_vector');
  try {
    // Drop the existing plain column and its index
    await sequelize.query('DROP INDEX IF EXISTS idx_knowledge_chunks_search_vector;');
    await sequelize.query('ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS search_vector;');

    // Add it as a generated column
    await sequelize.query(`
      ALTER TABLE knowledge_chunks
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
    `);

    // Re-create the GIN index
    await sequelize.query(`
      CREATE INDEX idx_knowledge_chunks_search_vector 
      ON knowledge_chunks USING gin (search_vector);
    `);

    console.log('✅ Migration 095 complete');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('◀ Rolling back migration 095: Generated search_vector');
  try {
    // Drop the generated column
    await sequelize.query('DROP INDEX IF EXISTS idx_knowledge_chunks_search_vector;');
    await sequelize.query('ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS search_vector;');

    // Re-add as a plain column
    const qi = sequelize.getQueryInterface();
    await qi.addColumn('knowledge_chunks', 'search_vector', {
      type: 'TSVECTOR',
      allowNull: true
    });

    // Re-create the GIN index
    await sequelize.query(`
      CREATE INDEX idx_knowledge_chunks_search_vector 
      ON knowledge_chunks USING gin (search_vector);
    `);

    console.log('✅ Rollback 095 complete');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
}

// Run migration
if (require.main === module) {
  const args = process.argv.slice(2);
  const isRollback = args.includes('--rollback') || args.includes('-r');

  (async () => {
    try {
      if (isRollback) {
        await down();
      } else {
        await up();
      }
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
