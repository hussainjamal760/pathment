/**
 * Migration: 041_user_preferences
 * Adds user_settings.preferences (JSONB) — a flexible bag for the settings
 * toggles that previously had no persistence (notification prefs, learning
 * prefs, admin platform/user-mgmt toggles). Idempotent.
 *
 * Run:      node server/scripts/migrations/041_user_preferences.js
 * Rollback: node server/scripts/migrations/041_user_preferences.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 041: user preferences');
  const cols = await qi.describeTable('user_settings').catch(() => ({}));
  if (!cols.preferences) {
    await qi.addColumn('user_settings', 'preferences', { type: S.JSONB, allowNull: false, defaultValue: {} });
    console.log('  ✓ Added user_settings.preferences');
  } else {
    console.log('  ℹ user_settings.preferences exists, skipping');
  }
  console.log('✅ Migration 041 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('user_settings', 'preferences').catch(() => {});
  console.log('✅ Rollback 041 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
