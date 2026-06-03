/**
 * Migration: 021_rewards
 *
 * Adds gifts + redemptions (rewards catalog + redemptions).
 *
 * Run:      node server/scripts/migrations/021_rewards.js
 * Rollback: node server/scripts/migrations/021_rewards.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 021: rewards');

  try {
    await qi.createTable('gifts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      cost_xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      stock: { type: Sequelize.INTEGER, allowNull: true },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    console.log('  ✓ Created gifts');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ gifts exists, skipping'); else throw e;
  }

  try {
    await qi.createTable('redemptions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      gift_id: { type: Sequelize.UUID, allowNull: false },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      redeemed_by: { type: Sequelize.UUID, allowNull: true },
      cost_xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('redemptions', ['gift_id']);
    await qi.addIndex('redemptions', ['mentee_id']);
    console.log('  ✓ Created redemptions');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ redemptions exists, skipping'); else throw e;
  }

  console.log('✅ Migration 021 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 021');
  for (const t of ['redemptions', 'gifts']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 021 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
