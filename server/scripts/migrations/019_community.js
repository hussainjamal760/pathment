/**
 * Migration: 019_community
 *
 * Adds community_posts + community_reactions (mentee cohort social feed).
 *
 * Run:      node server/scripts/migrations/019_community.js
 * Rollback: node server/scripts/migrations/019_community.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 019: community');

  try {
    await qi.createTable('community_posts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      author_id: { type: Sequelize.UUID, allowNull: false },
      to_id: { type: Sequelize.UUID, allowNull: true },
      type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'win' },
      body: { type: Sequelize.TEXT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('community_posts', ['author_id']);
    await qi.addIndex('community_posts', ['to_id']);
    await qi.addIndex('community_posts', ['type']);
    console.log('  ✓ Created community_posts');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ community_posts exists, skipping'); else throw e;
  }

  try {
    await qi.createTable('community_reactions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      post_id: { type: Sequelize.UUID, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false },
      type: { type: Sequelize.STRING(20), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('community_reactions', ['post_id', 'user_id', 'type'], { unique: true, name: 'community_reactions_unique' });
    await qi.addIndex('community_reactions', ['post_id']);
    console.log('  ✓ Created community_reactions');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ community_reactions exists, skipping'); else throw e;
  }

  console.log('✅ Migration 019 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 019');
  for (const t of ['community_reactions', 'community_posts']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 019 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
