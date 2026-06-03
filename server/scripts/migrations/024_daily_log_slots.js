/**
 * Migration: 024_daily_log_slots
 *
 * Adds daily_log_entries.slots_done (text[]) — which schedule slots (rituals)
 * a mentee ticked off that day.
 *
 * Run:      node server/scripts/migrations/024_daily_log_slots.js
 * Rollback: node server/scripts/migrations/024_daily_log_slots.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 024: daily_log_entries.slots_done');
  try {
    await qi.addColumn('daily_log_entries', 'slots_done', {
      type: Sequelize.ARRAY(Sequelize.STRING(64)), allowNull: false, defaultValue: []
    });
    console.log('  ✓ Added daily_log_entries.slots_done');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ slots_done exists, skipping'); else throw e;
  }
  console.log('✅ Migration 024 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 024');
  try { await qi.removeColumn('daily_log_entries', 'slots_done'); console.log('  ✓ Removed slots_done'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 024 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
