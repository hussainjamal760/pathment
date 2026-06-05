/**
 * Migration: 040_user_color_theme
 * Adds user_settings.color_theme (the per-user accent "vibe" key). Light/dark
 * already lives in user_settings.theme. Idempotent.
 *
 * Run:      node server/scripts/migrations/040_user_color_theme.js
 * Rollback: node server/scripts/migrations/040_user_color_theme.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 040: user color theme');
  const cols = await qi.describeTable('user_settings').catch(() => ({}));
  if (!cols.color_theme) {
    await qi.addColumn('user_settings', 'color_theme', { type: S.STRING(20), allowNull: false, defaultValue: 'ocean' });
    console.log('  ✓ Added user_settings.color_theme');
  } else {
    console.log('  ℹ user_settings.color_theme exists, skipping');
  }
  console.log('✅ Migration 040 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('user_settings', 'color_theme').catch(() => {});
  console.log('✅ Rollback 040 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
