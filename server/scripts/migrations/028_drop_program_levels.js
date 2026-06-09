/**
 * Migration: 028_drop_program_levels
 *
 * Fully removes the "levels" concept. Enrollment is now to a PROGRAM (no level
 * sub-structure); progression is mentor-approved program completion. Steps:
 *   1. Migrate any enrollments in 'level_completed' → 'program_completed'.
 *   2. Drop level FK columns: enrollments.current_level_id, mentor_mentee_matches.level_id,
 *      roadmaps.level_id, clans.level_id, clans.level_label.
 *   3. Drop the program_levels table.
 *
 * Run:      node server/scripts/migrations/028_drop_program_levels.js
 * Rollback: node server/scripts/migrations/028_drop_program_levels.js --rollback
 *           (best-effort: recreates an empty program_levels + the columns, nullable)
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function dropCol(qi, table, col) {
  try { await qi.removeColumn(table, col); console.log(`  ✓ Dropped ${table}.${col}`); }
  catch (e) { if (/does not exist/.test(e.message)) console.log(`  ℹ ${table}.${col} already gone`); else throw e; }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 028: drop program levels');

  // 1. Convert any level_completed enrollments to program_completed.
  try {
    const [, meta] = await sequelize.query(
      `UPDATE enrollments SET status = 'program_completed' WHERE status = 'level_completed'`
    );
    console.log(`  ✓ Migrated level_completed → program_completed (${meta?.rowCount ?? 0} rows)`);
  } catch (e) { if (!/does not exist/.test(e.message)) throw e; }

  // 2. Drop level FK columns (also drops their FK constraints + indexes).
  await dropCol(qi, 'enrollments', 'current_level_id');
  await dropCol(qi, 'mentor_mentee_matches', 'level_id');
  await dropCol(qi, 'roadmaps', 'level_id');
  await dropCol(qi, 'clans', 'level_id');
  await dropCol(qi, 'clans', 'level_label');

  // 3. Drop the table.
  try { await qi.dropTable('program_levels'); console.log('  ✓ Dropped program_levels'); }
  catch (e) { if (/does not exist/.test(e.message)) console.log('  ℹ program_levels already gone'); else throw e; }

  console.log('✅ Migration 028 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 028 (best-effort recreate)');
  try {
    await qi.createTable('program_levels', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      program_id: { type: Sequelize.UUID, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      level_order: { type: Sequelize.INTEGER, allowNull: false },
      duration_weeks: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      description: { type: Sequelize.TEXT, allowNull: true },
      learning_outcomes: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
      prerequisites: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
      target_audience: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    console.log('  ✓ Recreated program_levels (empty)');
  } catch (e) { if (!/already exists/.test(e.message)) throw e; }

  const addCol = async (table, col, def) => {
    try { await qi.addColumn(table, col, def); console.log(`  ✓ Re-added ${table}.${col}`); }
    catch (e) { if (!/already exists|duplicate column/i.test(e.message)) throw e; }
  };
  await addCol('enrollments', 'current_level_id', { type: Sequelize.UUID, allowNull: true });
  await addCol('mentor_mentee_matches', 'level_id', { type: Sequelize.UUID, allowNull: true });
  await addCol('roadmaps', 'level_id', { type: Sequelize.UUID, allowNull: true });
  await addCol('clans', 'level_id', { type: Sequelize.UUID, allowNull: true });
  await addCol('clans', 'level_label', { type: Sequelize.STRING(60), allowNull: true });
  console.log('✅ Rollback 028 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
