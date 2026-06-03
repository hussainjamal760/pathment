/**
 * Migration: 022_documents
 *
 * Adds documents — the org-shared mentor Library.
 *
 * Run:      node server/scripts/migrations/022_documents.js
 * Rollback: node server/scripts/migrations/022_documents.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 022: documents');
  try {
    await qi.createTable('documents', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      title: { type: Sequelize.STRING(200), allowNull: false },
      category: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'guidance' },
      summary: { type: Sequelize.TEXT, allowNull: true },
      author: { type: Sequelize.STRING(150), allowNull: true },
      url: { type: Sequelize.TEXT, allowNull: true },
      read_mins: { type: Sequelize.INTEGER, allowNull: true },
      pinned: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('documents', ['category']);
    await qi.addIndex('documents', ['pinned']);
    console.log('  ✓ Created documents');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ documents exists, skipping'); else throw e;
  }
  console.log('✅ Migration 022 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 022');
  try { await qi.dropTable('documents'); console.log('  ✓ Dropped documents'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 022 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
