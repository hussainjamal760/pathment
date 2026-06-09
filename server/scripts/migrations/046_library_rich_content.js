/**
 * Migration: 046_library_rich_content
 *
 * Library items can now hold a written rich-text article (HTML), not just an
 * external URL. Adds `documents.content`.
 *
 * Run:      node server/scripts/migrations/046_library_rich_content.js
 * Rollback: node server/scripts/migrations/046_library_rich_content.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 046: library rich content');
  try {
    await qi.addColumn('documents', 'content', { type: S.TEXT, allowNull: true });
    console.log('  ✓ Added documents.content');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ documents.content exists, skipping');
    else throw e;
  }
  console.log('✅ Migration 046 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 046');
  try { await qi.removeColumn('documents', 'content'); console.log('  ✓ Dropped documents.content'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 046 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
