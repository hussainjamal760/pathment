/**
 * Migration: 045_custom_roles
 *
 * Admin-defined roles: a named bundle of permissions at a scope level, on top of
 * the built-in roles in src/config/roles.js. Referenced from role_assignments by
 * `role` key exactly like a built-in role.
 *
 * Run:      node server/scripts/migrations/045_custom_roles.js
 * Rollback: node server/scripts/migrations/045_custom_roles.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 045: custom_roles');

  try {
    await qi.createTable('custom_roles', {
      id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
      // Stable identifier used in role_assignments.role (e.g. 'custom_ta_lead').
      key: { type: S.STRING(60), allowNull: false, unique: true },
      label: { type: S.STRING(80), allowNull: false },
      description: { type: S.TEXT },
      scope_level: { type: S.STRING(20), allowNull: false, defaultValue: 'org' },
      permissions: { type: S.JSONB, allowNull: false, defaultValue: [] },
      created_by: { type: S.UUID, allowNull: true },
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
    });
    console.log('  ✓ Created custom_roles');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ custom_roles exists, skipping');
    else throw e;
  }
  await qi.addIndex('custom_roles', ['key'], { unique: true, name: 'custom_roles_key_uniq' }).catch(() => {});

  console.log('✅ Migration 045 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 045');
  await qi.dropTable('custom_roles').then(() => console.log('  ✓ Dropped custom_roles')).catch(() => {});
  console.log('✅ Rollback 045 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
