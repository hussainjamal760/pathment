/**
 * Migration: 029_announcement_audience
 *
 * Extends announcement targeting beyond all|programId. `audience` becomes a
 * TYPE ('all' | 'mentors' | 'mentees' | 'program' | 'clan') and a new
 * `audience_id` (uuid) holds the program/clan id. Existing rows whose audience
 * was a programId are migrated to type 'program' + audience_id = that id.
 *
 * Run:      node server/scripts/migrations/029_announcement_audience.js
 * Rollback: node server/scripts/migrations/029_announcement_audience.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 029: announcement audience targeting');
  try {
    await qi.addColumn('announcements', 'audience_id', { type: Sequelize.UUID, allowNull: true });
    console.log('  ✓ Added announcements.audience_id');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ audience_id exists, skipping'); else throw e;
  }
  // Migrate any programId-valued audience → type 'program' + audience_id.
  const [, meta] = await sequelize.query(`
    UPDATE announcements
    SET audience_id = audience::uuid, audience = 'program'
    WHERE audience ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `);
  console.log(`  ✓ Migrated programId audiences → program type (${meta?.rowCount ?? 0} rows)`);
  await qi.addIndex('announcements', ['audience_id']).catch(() => {});
  console.log('✅ Migration 029 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 029');
  // Restore programId into audience for program-typed rows.
  await sequelize.query(`UPDATE announcements SET audience = audience_id::text WHERE audience = 'program' AND audience_id IS NOT NULL`).catch(() => {});
  try { await qi.removeColumn('announcements', 'audience_id'); console.log('  ✓ Dropped audience_id'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 029 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
