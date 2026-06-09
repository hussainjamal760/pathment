/**
 * Migration: 047_cross_clan_status
 *
 * Cross-clan cover is now consent-first: a lead mentor requests cover and the
 * covering person accepts before access activates. Adds `cross_clan_assignments.status`
 * (pending | active | declined) and `responded_at`. Existing rows default to
 * `active` so current grants keep working.
 *
 * Run:      node server/scripts/migrations/047_cross_clan_status.js
 * Rollback: node server/scripts/migrations/047_cross_clan_status.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 047: cross-clan status');
  try {
    await qi.addColumn('cross_clan_assignments', 'status', { type: S.STRING(20), allowNull: false, defaultValue: 'active' });
    console.log('  ✓ Added cross_clan_assignments.status');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ status exists, skipping');
    else throw e;
  }
  try {
    await qi.addColumn('cross_clan_assignments', 'responded_at', { type: S.DATE, allowNull: true });
    console.log('  ✓ Added cross_clan_assignments.responded_at');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ responded_at exists, skipping');
    else throw e;
  }
  console.log('✅ Migration 047 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 047');
  for (const col of ['status', 'responded_at']) {
    try { await qi.removeColumn('cross_clan_assignments', col); console.log(`  ✓ Dropped ${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 047 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
