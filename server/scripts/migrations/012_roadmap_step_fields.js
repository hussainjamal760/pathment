/**
 * Migration: 012_roadmap_step_fields
 *
 * Adds the new-design linear-roadmap step fields to roadmap_tasks:
 *   - effort (xs|s|m|l)
 *   - due_offset_days (int — days after assignment the step is due)
 *
 * Run:      node server/scripts/migrations/012_roadmap_step_fields.js
 * Rollback: node server/scripts/migrations/012_roadmap_step_fields.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function addColumn(qi, table, name, spec) {
  try { await qi.addColumn(table, name, spec); console.log(`  ✓ Added ${table}.${name}`); }
  catch (e) { if (/already exists/.test(e.message)) console.log(`  ℹ ${table}.${name} exists, skipping`); else throw e; }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 012: roadmap step fields');
  await addColumn(qi, 'roadmap_tasks', 'effort', { type: Sequelize.STRING(2), allowNull: true });
  await addColumn(qi, 'roadmap_tasks', 'due_offset_days', { type: Sequelize.INTEGER, allowNull: true });
  console.log('✅ Migration 012 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 012');
  for (const col of ['effort', 'due_offset_days']) {
    try { await qi.removeColumn('roadmap_tasks', col); console.log(`  ✓ Removed roadmap_tasks.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 012 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
