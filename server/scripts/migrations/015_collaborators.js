/**
 * Migration: 015_collaborators
 *
 * Adds collaborators — specialists invited to work with a mentee.
 *
 * Run:      node server/scripts/migrations/015_collaborators.js
 * Rollback: node server/scripts/migrations/015_collaborators.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 015: collaborators');
  try {
    await qi.createTable('collaborators', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      role: { type: Sequelize.STRING(80), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'invited' },
      invited_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('collaborators', ['mentee_id']);
    console.log('  ✓ Created collaborators');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ collaborators exists, skipping'); else throw e;
  }
  console.log('✅ Migration 015 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 015');
  try { await qi.dropTable('collaborators'); console.log('  ✓ Dropped collaborators'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 015 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
