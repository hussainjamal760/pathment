/**
 * Migration: 038_meeting_cancellation_reason
 * Adds a cancellation reason (+ who cancelled) to scheduled_meetings so a mentor
 * can explain why a 1:1 was cancelled and the mentee sees it.
 *
 * Run:      node server/scripts/migrations/038_meeting_cancellation_reason.js
 * Rollback: node server/scripts/migrations/038_meeting_cancellation_reason.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 038: meeting cancellation reason');
  const cols = await qi.describeTable('scheduled_meetings').catch(() => ({}));
  if (!cols.cancellation_reason) {
    await qi.addColumn('scheduled_meetings', 'cancellation_reason', { type: S.TEXT, allowNull: true })
      .then(() => console.log('  ✓ Added cancellation_reason'));
  }
  if (!cols.cancelled_by) {
    await qi.addColumn('scheduled_meetings', 'cancelled_by', { type: S.UUID, allowNull: true })
      .then(() => console.log('  ✓ Added cancelled_by'));
  }
  console.log('✅ Migration 038 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('scheduled_meetings', 'cancellation_reason').catch(() => {});
  await qi.removeColumn('scheduled_meetings', 'cancelled_by').catch(() => {});
  console.log('✅ Rollback 038 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
