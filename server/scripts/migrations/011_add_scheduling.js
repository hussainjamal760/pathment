/**
 * Migration: 011_add_scheduling
 *
 * Adds 1:1 scheduling: availability_slots (mentor publishes bookable slots) and
 * scheduled_meetings (a mentee booking becomes a meeting).
 *
 * Run:      node server/scripts/migrations/011_add_scheduling.js
 * Rollback: node server/scripts/migrations/011_add_scheduling.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 011: scheduling');

  try {
    await qi.createTable('availability_slots', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentor_id: { type: Sequelize.UUID, allowNull: false },
      day: { type: Sequelize.STRING(40), allowNull: false },
      time: { type: Sequelize.STRING(20), allowNull: false },
      duration_mins: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      taken: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      taken_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('availability_slots', ['mentor_id']);
    await qi.addIndex('availability_slots', ['taken']);
    console.log('  ✓ Created availability_slots');
  } catch (error) {
    if (/already exists/.test(error.message)) console.log('  ℹ availability_slots exists, skipping');
    else throw error;
  }

  try {
    await qi.createTable('scheduled_meetings', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentor_id: { type: Sequelize.UUID, allowNull: false },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      availability_slot_id: { type: Sequelize.UUID, allowNull: true },
      kind: { type: Sequelize.STRING(20), allowNull: false, defaultValue: '1:1' },
      day: { type: Sequelize.STRING(40), allowNull: false },
      time: { type: Sequelize.STRING(20), allowNull: false },
      duration_mins: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      agenda: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'scheduled' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('scheduled_meetings', ['mentor_id']);
    await qi.addIndex('scheduled_meetings', ['mentee_id']);
    await qi.addIndex('scheduled_meetings', ['status']);
    console.log('  ✓ Created scheduled_meetings');
  } catch (error) {
    if (/already exists/.test(error.message)) console.log('  ℹ scheduled_meetings exists, skipping');
    else throw error;
  }

  console.log('✅ Migration 011 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 011');
  for (const t of ['scheduled_meetings', 'availability_slots']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 011 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try { await (isRollback ? down() : up()); process.exit(0); }
    catch (error) { console.error('❌ Migration failed:', error.message); process.exit(1); }
  })();
}

module.exports = { up, down };
