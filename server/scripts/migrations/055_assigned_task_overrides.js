/**
 * Migration: 055_assigned_task_overrides
 *
 * Per-mentee task customization. An AssignedTask references a shared RoadmapTask;
 * these nullable override columns let a mentor tailor ONE mentee's copy (fix a
 * resource link, tweak the brief, add a private note) without touching the
 * roadmap step or other mentees. The mentee sees the override when set, else the
 * roadmap default.
 *
 * Run:      node server/scripts/migrations/055_assigned_task_overrides.js
 * Rollback: node server/scripts/migrations/055_assigned_task_overrides.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = {
  title_override: { type: Sequelize.STRING(255), allowNull: true },
  description_override: { type: Sequelize.TEXT, allowNull: true },
  deliverable_override: { type: Sequelize.TEXT, allowNull: true },
  acceptance_criteria_override: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
  resources_override: { type: Sequelize.JSONB, allowNull: true },
  mentor_note: { type: Sequelize.TEXT, allowNull: true },
};

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 055: assigned_task per-mentee overrides');
  for (const [name, spec] of Object.entries(COLUMNS)) {
    try {
      await qi.addColumn('assigned_tasks', name, spec);
      console.log(`  ✓ Added assigned_tasks.${name}`);
    } catch (e) {
      if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ assigned_tasks.${name} exists, skipping`);
      else throw e;
    }
  }
  console.log('✅ Migration 055 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 055');
  for (const name of Object.keys(COLUMNS)) {
    try { await qi.removeColumn('assigned_tasks', name); console.log(`  ✓ Dropped assigned_tasks.${name}`); }
    catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 055 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
