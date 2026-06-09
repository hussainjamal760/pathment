/**
 * Migration: 044_role_assignments
 *
 * Scoped RBAC: a user holds a `role` at a `scope` (org / program / clan / self).
 * This is the persisted half of authorization — most assignments are still
 * DERIVED at request time from capabilities + clan memberships, but this table
 * lets an admin grant scoped roles explicitly (e.g. "program_admin of Program X",
 * "co_mentor of Clan Y") without touching anyone's primary role.
 *
 * Run:      node server/scripts/migrations/044_role_assignments.js
 * Rollback: node server/scripts/migrations/044_role_assignments.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 044: role_assignments');

  try {
    await qi.createTable('role_assignments', {
      id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
      user_id: { type: S.UUID, allowNull: false },
      role: { type: S.STRING(40), allowNull: false },
      // 'org' | 'program' | 'clan' | 'self'
      scope_type: { type: S.STRING(20), allowNull: false, defaultValue: 'org' },
      // null for org scope; program/clan/user id otherwise
      scope_id: { type: S.UUID, allowNull: true },
      granted_by: { type: S.UUID, allowNull: true },
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
    });
    console.log('  ✓ Created role_assignments');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ role_assignments exists, skipping');
    else throw e;
  }

  await qi.addIndex('role_assignments', ['user_id']).catch(() => {});
  await qi.addIndex('role_assignments', ['scope_type', 'scope_id']).catch(() => {});
  await qi.addIndex('role_assignments', ['user_id', 'role', 'scope_type', 'scope_id'], {
    unique: true, name: 'role_assignments_unique'
  }).catch(() => {});

  console.log('✅ Migration 044 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 044');
  await qi.dropTable('role_assignments').then(() => console.log('  ✓ Dropped role_assignments')).catch(() => {});
  console.log('✅ Rollback 044 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
