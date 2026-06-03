/**
 * Migration: 018_announcements
 *
 * Adds announcements + announcement_reactions (org broadcast + reactions).
 *
 * Run:      node server/scripts/migrations/018_announcements.js
 * Rollback: node server/scripts/migrations/018_announcements.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 018: announcements');

  try {
    await qi.createTable('announcements', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      title: { type: Sequelize.STRING(200), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      author_id: { type: Sequelize.UUID, allowNull: false },
      audience: { type: Sequelize.STRING(60), allowNull: false, defaultValue: 'all' },
      pinned: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('announcements', ['audience']);
    await qi.addIndex('announcements', ['pinned']);
    console.log('  ✓ Created announcements');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ announcements exists, skipping'); else throw e;
  }

  try {
    await qi.createTable('announcement_reactions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      announcement_id: { type: Sequelize.UUID, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false },
      type: { type: Sequelize.STRING(20), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('announcement_reactions', ['announcement_id', 'user_id', 'type'], { unique: true, name: 'announcement_reactions_unique' });
    await qi.addIndex('announcement_reactions', ['announcement_id']);
    console.log('  ✓ Created announcement_reactions');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ announcement_reactions exists, skipping'); else throw e;
  }

  console.log('✅ Migration 018 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 018');
  for (const t of ['announcement_reactions', 'announcements']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 018 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
