/**
 * Migration: 042_message_delivery_reactions
 * WhatsApp-style messaging: adds messages.delivered_at (sent→delivered→read
 * ticks; read already tracked via is_read/read_at) and a message_reactions
 * table (one emoji per user per message, toggle to change/remove). Idempotent.
 *
 * Run:      node server/scripts/migrations/042_message_delivery_reactions.js
 * Rollback: node server/scripts/migrations/042_message_delivery_reactions.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 042: message delivery + reactions');

  const cols = await qi.describeTable('messages').catch(() => ({}));
  if (!cols.delivered_at) {
    await qi.addColumn('messages', 'delivered_at', { type: S.DATE, allowNull: true });
    console.log('  ✓ Added messages.delivered_at');
  } else {
    console.log('  ℹ messages.delivered_at exists, skipping');
  }

  await qi.createTable('message_reactions', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    message_id: { type: S.UUID, allowNull: false },
    user_id: { type: S.UUID, allowNull: false },
    emoji: { type: S.STRING(16), allowNull: false },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
  }).then(() => console.log('  ✓ Created message_reactions')).catch((e) => {
    if (/already exists/i.test(e.message)) console.log('  ℹ message_reactions exists, skipping'); else throw e;
  });
  await qi.addIndex('message_reactions', ['message_id', 'user_id'], { unique: true, name: 'message_reactions_message_user_uniq' }).catch(() => {});
  await qi.addIndex('message_reactions', ['message_id']).catch(() => {});

  console.log('✅ Migration 042 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable('message_reactions').catch(() => {});
  await qi.removeColumn('messages', 'delivered_at').catch(() => {});
  console.log('✅ Rollback 042 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
