/**
 * Migration: Add pgvector extension
 *
 * Enables the vector extension for RAG embedding storage and similarity search.
 * This should be idempotent.
 *
 * Run:      node scripts/migrations/090_add_pgvector_extension.js
 * Rollback: node scripts/migrations/090_add_pgvector_extension.js --rollback
 */

require('dotenv').config();
const { sequelize } = require('../../src/db');

async function up() {
  console.log('Running migration: Add pgvector extension...');
  try {
    // Enable the extension (safe to run multiple times)
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log('  ✅ vector extension enabled');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('Rolling back migration: Remove pgvector extension...');
  try {
    // We intentionally do not drop the extension automatically to prevent
    // accidental loss of vector data if another part of the system relies on it.
    console.log('  ⚠️ vector extension is not dropped automatically.');
    console.log('  If you are sure, you can run: DROP EXTENSION IF EXISTS vector;');
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
