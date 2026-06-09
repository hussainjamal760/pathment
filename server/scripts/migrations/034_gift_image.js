/**
 * Migration: 034_gift_image
 * Adds an image/GIF url to rewards gifts so the catalog can show artwork.
 *
 * Run:      node server/scripts/migrations/034_gift_image.js
 * Rollback: node server/scripts/migrations/034_gift_image.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 034: gift image_url');
  try {
    await qi.addColumn('gifts', 'image_url', { type: Sequelize.STRING(500), allowNull: true });
    console.log('  ✓ Added gifts.image_url');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ gifts.image_url exists, skipping');
    else throw e;
  }
  console.log('✅ Migration 034 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('gifts', 'image_url').catch((e) => { if (!/does not exist/.test(e.message)) throw e; });
  console.log('✅ Rollback 034 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
