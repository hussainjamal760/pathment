/**
 * Migration: 050_meeting_note_attendance
 *
 * Cohort review needs durable attendance: mark a mentee present/absent/excused
 * and have it persist + show on their timeline. Adds `attendance` to meeting_notes
 * (a 'review' note per mentee per session carries it).
 *
 * Run:      node server/scripts/migrations/050_meeting_note_attendance.js
 * Rollback: node server/scripts/migrations/050_meeting_note_attendance.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 050: meeting note attendance');
  try {
    await qi.addColumn('meeting_notes', 'attendance', { type: S.STRING(10), allowNull: true });
    console.log('  ✓ added meeting_notes.attendance');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ attendance exists, skipping');
    else throw e;
  }
  console.log('✅ Migration 050 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 050');
  try { await qi.removeColumn('meeting_notes', 'attendance'); console.log('  ✓ dropped attendance'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 050 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
