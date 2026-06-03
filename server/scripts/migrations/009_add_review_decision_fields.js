/**
 * Migration: 009_add_review_decision_fields
 *
 * Adds the 4-decision review fields to task_feedback:
 *   - decision (approved | approved_notes | changes | rejected)
 *   - checked_criteria (jsonb — labels of ticked acceptance criteria)
 * Backfills decision from the existing is_approved boolean.
 *
 * Run:      node server/scripts/migrations/009_add_review_decision_fields.js
 * Rollback: node server/scripts/migrations/009_add_review_decision_fields.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 009: review decision fields');

  try {
    await qi.addColumn('task_feedback', 'decision', { type: Sequelize.STRING(20), allowNull: true });
    console.log('  ✓ Added task_feedback.decision');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) console.log('  ℹ decision already exists, skipping');
    else throw error;
  }

  try {
    await qi.addColumn('task_feedback', 'checked_criteria', { type: Sequelize.JSONB, allowNull: true });
    console.log('  ✓ Added task_feedback.checked_criteria');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) console.log('  ℹ checked_criteria already exists, skipping');
    else throw error;
  }

  await sequelize.query(
    "UPDATE task_feedback SET decision = CASE WHEN is_approved THEN 'approved' ELSE 'changes' END WHERE decision IS NULL"
  );
  console.log('  ✓ Backfilled decision from is_approved');

  console.log('✅ Migration 009 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 009');
  for (const col of ['checked_criteria', 'decision']) {
    try {
      await qi.removeColumn('task_feedback', col);
      console.log(`  ✓ Removed task_feedback.${col}`);
    } catch (error) {
      if (!(error.message && error.message.includes('does not exist'))) throw error;
      console.log(`  ℹ ${col} does not exist, skipping`);
    }
  }
  console.log('✅ Rollback 009 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try { await (isRollback ? down() : up()); process.exit(0); }
    catch (error) { console.error('❌ Migration failed:', error.message); process.exit(1); }
  })();
}

module.exports = { up, down };
