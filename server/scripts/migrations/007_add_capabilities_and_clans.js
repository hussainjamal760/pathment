/**
 * Migration: 007_add_capabilities_and_clans
 *
 * Foundation for multi-role users and the Clan model:
 *   - Adds users.capabilities (text[]) and backfills it to [role] so existing
 *     single-role users keep working unchanged.
 *   - Creates the clans table (mentor-led group inside a Program).
 *   - Creates the clan_memberships table (a user's clan-scoped role) with a
 *     unique (clan_id, user_id) constraint.
 *
 * Run manually:
 *   node server/scripts/migrations/007_add_capabilities_and_clans.js
 *
 * Rollback:
 *   node server/scripts/migrations/007_add_capabilities_and_clans.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();

  console.log('▶ Running migration 007: capabilities + clans');

  // 1) users.capabilities ------------------------------------------------
  try {
    await qi.addColumn('users', 'capabilities', {
      type: Sequelize.ARRAY(Sequelize.STRING(20)),
      allowNull: false,
      defaultValue: []
    });
    console.log('  ✓ Added users.capabilities column');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ users.capabilities already exists, skipping');
    } else {
      throw error;
    }
  }

  // Backfill capabilities = [role] for any rows not yet populated.
  await sequelize.query(
    "UPDATE users SET capabilities = ARRAY[role] WHERE capabilities IS NULL OR capabilities = '{}'"
  );
  console.log('  ✓ Backfilled users.capabilities = [role]');

  // 2) clans -------------------------------------------------------------
  try {
    await qi.createTable('clans', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      program_id: { type: Sequelize.UUID, allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      lead_mentor_id: { type: Sequelize.UUID, allowNull: true },
      level_id: { type: Sequelize.UUID, allowNull: true },
      level_label: { type: Sequelize.STRING(60), allowNull: true },
      tags: { type: Sequelize.ARRAY(Sequelize.STRING(40)), allowNull: false, defaultValue: [] },
      max_mentees: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 25 },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
      health_status: { type: Sequelize.STRING(10), allowNull: true },
      created_by: { type: Sequelize.UUID, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('clans', ['program_id']);
    await qi.addIndex('clans', ['lead_mentor_id']);
    await qi.addIndex('clans', ['status']);
    console.log('  ✓ Created clans table');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ clans table already exists, skipping');
    } else {
      throw error;
    }
  }

  // 3) clan_memberships --------------------------------------------------
  try {
    await qi.createTable('clan_memberships', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      clan_id: { type: Sequelize.UUID, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false },
      role: { type: Sequelize.STRING(20), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
      enrollment_id: { type: Sequelize.UUID, allowNull: true },
      joined_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      left_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('clan_memberships', ['clan_id', 'user_id'], { unique: true, name: 'clan_memberships_clan_user_unique' });
    await qi.addIndex('clan_memberships', ['user_id']);
    await qi.addIndex('clan_memberships', ['clan_id']);
    await qi.addIndex('clan_memberships', ['role']);
    console.log('  ✓ Created clan_memberships table');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ clan_memberships table already exists, skipping');
    } else {
      throw error;
    }
  }

  console.log('✅ Migration 007 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();

  console.log('▶ Rolling back migration 007: capabilities + clans');

  try {
    await qi.dropTable('clan_memberships');
    console.log('  ✓ Dropped clan_memberships table');
  } catch (error) {
    if (!(error.message && error.message.includes('does not exist'))) throw error;
    console.log('  ℹ clan_memberships does not exist, skipping');
  }

  try {
    await qi.dropTable('clans');
    console.log('  ✓ Dropped clans table');
  } catch (error) {
    if (!(error.message && error.message.includes('does not exist'))) throw error;
    console.log('  ℹ clans does not exist, skipping');
  }

  try {
    await qi.removeColumn('users', 'capabilities');
    console.log('  ✓ Removed users.capabilities column');
  } catch (error) {
    if (!(error.message && error.message.includes('does not exist'))) throw error;
    console.log('  ℹ users.capabilities does not exist, skipping');
  }

  console.log('✅ Rollback 007 complete');
}

// Run migration
if (require.main === module) {
  const args = process.argv.slice(2);
  const isRollback = args.includes('--rollback') || args.includes('-r');

  (async () => {
    try {
      if (isRollback) {
        await down();
      } else {
        await up();
      }
      process.exit(0);
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
