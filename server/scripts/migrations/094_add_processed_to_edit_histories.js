/**
 * Migration: 094_add_processed_to_edit_histories
 *
 * Adds the missing `processed` column to `mentor_edit_histories` 
 * so the `styleLearningWorker` can track which edits have been 
 * mathematically folded into the mentor's style profile.
 *
 * Run:      node server/scripts/migrations/094_add_processed_to_edit_histories.js
 * Rollback: node server/scripts/migrations/094_add_processed_to_edit_histories.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 094: Add processed to mentor_edit_histories');

  // Column addition removed: 093_rag_style_learning.js now exclusively handles adding the 'processed' column.

  // Create an index to speed up the worker's polling query
  try {
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_mentor_edit_histories_processed 
      ON mentor_edit_histories (processed);
    `);
    console.log('  ✓ Index on "processed" added');
  } catch (e) {
    console.log('  ℹ Index on "processed" already exists or failed:', e.message);
  }

  console.log('✅ Migration 094 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('◀ Rolling back migration 094');

  try {
    await qi.removeColumn('mentor_edit_histories', 'processed');
    console.log('  ✓ Column "processed" removed');
    console.log('✅ Rollback 094 complete');
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
