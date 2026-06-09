/**
 * Migration: 039_profile_location_details
 * Adds editable location + extra profile details: users.city / country /
 * languages, and the missing mentee_profiles.portfolio_url. Timezone already
 * lives on user_settings. Idempotent.
 *
 * Run:      node server/scripts/migrations/039_profile_location_details.js
 * Rollback: node server/scripts/migrations/039_profile_location_details.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function addIfMissing(qi, table, column, spec) {
  const cols = await qi.describeTable(table).catch(() => ({}));
  if (!cols[column]) {
    await qi.addColumn(table, column, spec);
    console.log(`  ✓ Added ${table}.${column}`);
  } else {
    console.log(`  ℹ ${table}.${column} exists, skipping`);
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 039: profile location details');
  await addIfMissing(qi, 'users', 'city', { type: S.STRING(120), allowNull: true });
  await addIfMissing(qi, 'users', 'country', { type: S.STRING(120), allowNull: true });
  await addIfMissing(qi, 'users', 'languages', { type: S.ARRAY(S.TEXT), allowNull: false, defaultValue: [] });
  await addIfMissing(qi, 'mentee_profiles', 'portfolio_url', { type: S.STRING(255), allowNull: true });
  console.log('✅ Migration 039 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('users', 'city').catch(() => {});
  await qi.removeColumn('users', 'country').catch(() => {});
  await qi.removeColumn('users', 'languages').catch(() => {});
  await qi.removeColumn('mentee_profiles', 'portfolio_url').catch(() => {});
  console.log('✅ Rollback 039 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
