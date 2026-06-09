/**
 * Migration: 049_meeting_note_attribution
 *
 * "Logged by" attribution on a 1:1: a mentor can attribute a session to an
 * invited specialist (a mentee collaborator) instead of themselves. Adds
 * `attributed_to` (display name) and `attributed_to_id` (collaborator id, nullable)
 * to meeting_notes. `created_by` still records the real authenticated logger.
 *
 * Run:      node server/scripts/migrations/049_meeting_note_attribution.js
 * Rollback: node server/scripts/migrations/049_meeting_note_attribution.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 049: meeting note attribution');
  const add = async (col, def) => {
    try { await qi.addColumn('meeting_notes', col, def); console.log(`  ✓ added meeting_notes.${col}`); }
    catch (e) { if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${col} exists, skipping`); else throw e; }
  };
  await add('attributed_to', { type: S.STRING(150), allowNull: true });
  await add('attributed_to_id', { type: S.UUID, allowNull: true });
  console.log('✅ Migration 049 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 049');
  for (const col of ['attributed_to', 'attributed_to_id']) {
    try { await qi.removeColumn('meeting_notes', col); console.log(`  ✓ dropped ${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 049 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
