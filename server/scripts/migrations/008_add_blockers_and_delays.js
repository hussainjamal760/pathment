/**
 * Migration: 008_add_blockers_and_delays
 *
 * Adds the blockers and delay_events tables — the inputs to the mentor
 * cockpit's openBlockers count and the relative-progress / risk fairness read.
 *
 * Run:      node server/scripts/migrations/008_add_blockers_and_delays.js
 * Rollback: node server/scripts/migrations/008_add_blockers_and_delays.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 008: blockers + delay_events');

  try {
    await qi.createTable('blockers', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      assigned_task_id: { type: Sequelize.UUID, allowNull: true },
      title: { type: Sequelize.STRING(255), allowNull: false },
      category: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'technical' },
      severity: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'medium' },
      status: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'open' },
      created_by: { type: Sequelize.UUID, allowNull: true },
      opened_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('blockers', ['mentee_id']);
    await qi.addIndex('blockers', ['assigned_task_id']);
    await qi.addIndex('blockers', ['status']);
    console.log('  ✓ Created blockers table');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ blockers already exists, skipping');
    } else { throw error; }
  }

  try {
    await qi.createTable('delay_events', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      assigned_task_id: { type: Sequelize.UUID, allowNull: true },
      reason: { type: Sequelize.TEXT, allowNull: false },
      kind: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'other' },
      days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      accepted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      category: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'external' },
      ai_rationale: { type: Sequelize.TEXT, allowNull: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      occurred_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('delay_events', ['mentee_id']);
    await qi.addIndex('delay_events', ['assigned_task_id']);
    await qi.addIndex('delay_events', ['accepted']);
    console.log('  ✓ Created delay_events table');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ delay_events already exists, skipping');
    } else { throw error; }
  }

  console.log('✅ Migration 008 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 008');
  for (const t of ['delay_events', 'blockers']) {
    try {
      await qi.dropTable(t);
      console.log(`  ✓ Dropped ${t}`);
    } catch (error) {
      if (!(error.message && error.message.includes('does not exist'))) throw error;
      console.log(`  ℹ ${t} does not exist, skipping`);
    }
  }
  console.log('✅ Rollback 008 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try {
      await (isRollback ? down() : up());
      process.exit(0);
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
