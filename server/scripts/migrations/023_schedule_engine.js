/**
 * Migration: 023_schedule_engine
 *
 * Adds schedule_templates (reusable day-shapes) and mentee_schedules
 * (per-mentee filled slots). The roadmap-chain-in-slot reuses the existing
 * roadmap_progress.slot column; 1:1 availability reuses availability_slots.
 *
 * Run:      node server/scripts/migrations/023_schedule_engine.js
 * Rollback: node server/scripts/migrations/023_schedule_engine.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 023: schedule engine');

  try {
    await qi.createTable('schedule_templates', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      source: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'mentor' },
      owner_mentor_id: { type: Sequelize.UUID, allowNull: true },
      blocks: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('schedule_templates', ['source']);
    await qi.addIndex('schedule_templates', ['owner_mentor_id']);
    console.log('  ✓ Created schedule_templates');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ schedule_templates exists, skipping'); else throw e;
  }

  try {
    await qi.createTable('mentee_schedules', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      template_id: { type: Sequelize.UUID, allowNull: true },
      schedule: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      assigned_by: { type: Sequelize.UUID, allowNull: true },
      assigned_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('mentee_schedules', ['mentee_id'], { unique: true, name: 'mentee_schedules_mentee_unique' });
    console.log('  ✓ Created mentee_schedules');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ mentee_schedules exists, skipping'); else throw e;
  }

  console.log('✅ Migration 023 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 023');
  for (const t of ['mentee_schedules', 'schedule_templates']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 023 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
