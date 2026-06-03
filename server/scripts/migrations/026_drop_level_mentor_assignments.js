/**
 * Migration: 026_drop_level_mentor_assignments
 *
 * Removes the program→level→mentor gating subsystem. Mentor cohort visibility
 * was never sourced from this table (it uses MentorMenteeMatch + clan membership),
 * and matching no longer gates candidates by level — so the table is now dead.
 *
 * Run:      node server/scripts/migrations/026_drop_level_mentor_assignments.js
 * Rollback: node server/scripts/migrations/026_drop_level_mentor_assignments.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 026: drop level_mentor_assignments');
  try {
    await qi.dropTable('level_mentor_assignments');
    console.log('  ✓ Dropped level_mentor_assignments');
  } catch (e) {
    if (/does not exist/.test(e.message)) console.log('  ℹ level_mentor_assignments already gone, skipping');
    else throw e;
  }
  console.log('✅ Migration 026 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 026 (recreating level_mentor_assignments)');
  try {
    await qi.createTable('level_mentor_assignments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      level_id: { type: Sequelize.UUID, allowNull: false },
      mentor_id: { type: Sequelize.UUID, allowNull: false },
      assigned_by: { type: Sequelize.UUID, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      assigned_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      unassigned_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('level_mentor_assignments', ['level_id', 'mentor_id'], { unique: true, name: 'level_mentor_assignments_level_id_mentor_id' });
    console.log('  ✓ Recreated level_mentor_assignments (empty)');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ table exists, skipping'); else throw e;
  }
  console.log('✅ Rollback 026 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
