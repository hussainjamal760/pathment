/**
 * Migration: 020_clan_requests
 *
 * Adds clan_change_requests, cross_clan_assignments, org_policies.
 *
 * Run:      node server/scripts/migrations/020_clan_requests.js
 * Rollback: node server/scripts/migrations/020_clan_requests.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 020: clan requests');

  const tables = {
    clan_change_requests: {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      from_clan_id: { type: Sequelize.UUID, allowNull: true },
      to_clan_id: { type: Sequelize.UUID, allowNull: false },
      reason: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      resolution_note: { type: Sequelize.TEXT, allowNull: true },
      resolved_by: { type: Sequelize.UUID, allowNull: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    },
    cross_clan_assignments: {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      kind: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'cover' },
      user_id: { type: Sequelize.UUID, allowNull: true },
      from_clan_id: { type: Sequelize.UUID, allowNull: true },
      to_clan_id: { type: Sequelize.UUID, allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    },
    org_policies: {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      title: { type: Sequelize.STRING(200), allowNull: false },
      category: { type: Sequelize.STRING(60), allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: false },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    }
  };

  for (const [name, cols] of Object.entries(tables)) {
    try {
      await qi.createTable(name, cols);
      console.log(`  ✓ Created ${name}`);
    } catch (e) {
      if (/already exists/.test(e.message)) console.log(`  ℹ ${name} exists, skipping`); else throw e;
    }
  }
  try { await qi.addIndex('clan_change_requests', ['status']); } catch (e) { if (!/already exists/.test(e.message)) throw e; }

  console.log('✅ Migration 020 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 020');
  for (const t of ['clan_change_requests', 'cross_clan_assignments', 'org_policies']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 020 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
