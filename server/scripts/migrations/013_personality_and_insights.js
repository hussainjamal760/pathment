/**
 * Migration: 013_personality_and_insights
 *
 *   - mentee_profiles.personality (jsonb — working-style dims)
 *   - insights table (mentor-logged observations about a mentee)
 *
 * Run:      node server/scripts/migrations/013_personality_and_insights.js
 * Rollback: node server/scripts/migrations/013_personality_and_insights.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 013: personality + insights');

  try {
    await qi.addColumn('mentee_profiles', 'personality', { type: Sequelize.JSONB, allowNull: true });
    console.log('  ✓ Added mentee_profiles.personality');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ personality exists, skipping'); else throw e;
  }

  try {
    await qi.createTable('insights', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      kind: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'general' },
      note: { type: Sequelize.TEXT, allowNull: false },
      source: { type: Sequelize.STRING(20), allowNull: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('insights', ['mentee_id']);
    await qi.addIndex('insights', ['kind']);
    console.log('  ✓ Created insights table');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ insights exists, skipping'); else throw e;
  }

  console.log('✅ Migration 013 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 013');
  try { await qi.dropTable('insights'); console.log('  ✓ Dropped insights'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  try { await qi.removeColumn('mentee_profiles', 'personality'); console.log('  ✓ Removed mentee_profiles.personality'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 013 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
