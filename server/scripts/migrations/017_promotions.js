/**
 * Migration: 017_promotions
 *
 * Adds promotion_candidates — the mentee→co-mentor promotion pipeline.
 *
 * Run:      node server/scripts/migrations/017_promotions.js
 * Rollback: node server/scripts/migrations/017_promotions.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 017: promotion_candidates');
  try {
    await qi.createTable('promotion_candidates', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      nominated_by: { type: Sequelize.UUID, allowNull: false },
      stage: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'nominated' },
      motivation: { type: Sequelize.TEXT, allowNull: true },
      strengths: { type: Sequelize.TEXT, allowNull: true },
      availability: { type: Sequelize.STRING(120), allowNull: true },
      decision_note: { type: Sequelize.TEXT, allowNull: true },
      target_clan_id: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('promotion_candidates', ['mentee_id']);
    await qi.addIndex('promotion_candidates', ['nominated_by']);
    await qi.addIndex('promotion_candidates', ['stage']);
    console.log('  ✓ Created promotion_candidates');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ promotion_candidates exists, skipping'); else throw e;
  }
  console.log('✅ Migration 017 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 017');
  try { await qi.dropTable('promotion_candidates'); console.log('  ✓ Dropped promotion_candidates'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 017 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
