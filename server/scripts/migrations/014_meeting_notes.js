/**
 * Migration: 014_meeting_notes
 *
 * Adds meeting_notes — logged 1:1 records (summary/sentiment/issues/next-steps)
 * shown on the mentee profile timeline.
 *
 * Run:      node server/scripts/migrations/014_meeting_notes.js
 * Rollback: node server/scripts/migrations/014_meeting_notes.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 014: meeting_notes');
  try {
    await qi.createTable('meeting_notes', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      mentor_id: { type: Sequelize.UUID, allowNull: false },
      scheduled_meeting_id: { type: Sequelize.UUID, allowNull: true },
      date: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      kind: { type: Sequelize.STRING(20), allowNull: false, defaultValue: '1:1' },
      summary: { type: Sequelize.TEXT, allowNull: false },
      sentiment: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'neutral' },
      issues: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: false, defaultValue: [] },
      next_steps: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: false, defaultValue: [] },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('meeting_notes', ['mentee_id']);
    await qi.addIndex('meeting_notes', ['mentor_id']);
    console.log('  ✓ Created meeting_notes');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ meeting_notes exists, skipping'); else throw e;
  }
  console.log('✅ Migration 014 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 014');
  try { await qi.dropTable('meeting_notes'); console.log('  ✓ Dropped meeting_notes'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 014 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
