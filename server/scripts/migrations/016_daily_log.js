/**
 * Migration: 016_daily_log
 *
 * Adds daily_log_entries — a mentee's daily check-in (tasks worked + note),
 * one per day, backfillable.
 *
 * Run:      node server/scripts/migrations/016_daily_log.js
 * Rollback: node server/scripts/migrations/016_daily_log.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 016: daily_log_entries');
  try {
    await qi.createTable('daily_log_entries', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      date_key: { type: Sequelize.STRING(10), allowNull: false },
      tasks_done: { type: Sequelize.ARRAY(Sequelize.UUID), allowNull: false, defaultValue: [] },
      note: { type: Sequelize.TEXT, allowNull: true },
      logged_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('daily_log_entries', ['mentee_id', 'date_key'], { unique: true, name: 'daily_log_mentee_date_unique' });
    await qi.addIndex('daily_log_entries', ['mentee_id']);
    console.log('  ✓ Created daily_log_entries');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ daily_log_entries exists, skipping'); else throw e;
  }
  console.log('✅ Migration 016 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 016');
  try { await qi.dropTable('daily_log_entries'); console.log('  ✓ Dropped daily_log_entries'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 016 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
