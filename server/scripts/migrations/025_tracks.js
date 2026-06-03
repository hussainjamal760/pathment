/**
 * Migration: 025_tracks
 *
 * Tracks = lightweight personal lanes per mentee (e.g. "Frontend", "Soft skills").
 * Tasks belong to a track via assigned_tasks.track_id; the mentee's This-Week view
 * groups by track and the mentor manages lanes from the mentee profile.
 *
 * Run:      node server/scripts/migrations/025_tracks.js
 * Rollback: node server/scripts/migrations/025_tracks.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 025: tracks');

  try {
    await qi.createTable('tracks', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      color: { type: Sequelize.STRING(20), allowNull: true },
      source: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'blank' },
      archived: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      order_index: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('tracks', ['mentee_id']);
    await qi.addIndex('tracks', ['mentee_id', 'archived']);
    console.log('  ✓ Created tracks');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ tracks exists, skipping'); else throw e;
  }

  try {
    await qi.addColumn('assigned_tasks', 'track_id', { type: Sequelize.UUID, allowNull: true });
    await qi.addIndex('assigned_tasks', ['track_id']);
    console.log('  ✓ Added assigned_tasks.track_id');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ assigned_tasks.track_id exists, skipping'); else throw e;
  }

  console.log('✅ Migration 025 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 025');
  try { await qi.removeColumn('assigned_tasks', 'track_id'); console.log('  ✓ Dropped assigned_tasks.track_id'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  try { await qi.dropTable('tracks'); console.log('  ✓ Dropped tracks'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 025 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
