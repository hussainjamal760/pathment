/**
 * Migration: 048_meeting_note_richer_1on1
 *
 * Richer 1:1 logger: capture the *understanding*, not just that you met. Adds
 * `personality_read` (TEXT), `working_style` (JSONB: consistency/communication/
 * resilience/independence 0-100), and `blockers` (TEXT[]) to meeting_notes.
 *
 * Run:      node server/scripts/migrations/048_meeting_note_richer_1on1.js
 * Rollback: node server/scripts/migrations/048_meeting_note_richer_1on1.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 048: richer 1:1 meeting notes');
  const add = async (col, def) => {
    try { await qi.addColumn('meeting_notes', col, def); console.log(`  ✓ added meeting_notes.${col}`); }
    catch (e) { if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${col} exists, skipping`); else throw e; }
  };
  await add('personality_read', { type: S.TEXT, allowNull: true });
  await add('working_style', { type: S.JSONB, allowNull: true });
  await add('blockers', { type: S.ARRAY(S.TEXT), allowNull: false, defaultValue: [] });
  console.log('✅ Migration 048 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 048');
  for (const col of ['personality_read', 'working_style', 'blockers']) {
    try { await qi.removeColumn('meeting_notes', col); console.log(`  ✓ dropped ${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 048 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
