/**
 * Migration: 005_add_registration_invites
 *
 * Creates:
 * - registration_invites
 *
 * Run manually:
 *   node server/scripts/migrations/005_add_registration_invites.js
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();

  console.log('▶ Running migration 005: add registration invites table');

  await qi.createTable('registration_invites', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
      primaryKey: true,
      allowNull: false
    },
    token_hash: {
      type: Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    email: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    role: {
      type: Sequelize.STRING(20),
      allowNull: false
    },
    invited_by: {
      type: Sequelize.UUID,
      allowNull: false
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    used_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    used_by: {
      type: Sequelize.UUID,
      allowNull: true
    },
    revoked_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    metadata: {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    }
  }).catch(async (error) => {
    if (error.message && error.message.includes('already exists')) {
      console.log('  ℹ registration_invites table already exists, skipping create');
      return;
    }
    throw error;
  });

  await sequelize.query('CREATE INDEX IF NOT EXISTS registration_invites_token_hash_idx ON registration_invites(token_hash);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS registration_invites_email_idx ON registration_invites(email);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS registration_invites_role_idx ON registration_invites(role);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS registration_invites_invited_by_idx ON registration_invites(invited_by);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS registration_invites_expires_at_idx ON registration_invites(expires_at);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS registration_invites_used_at_idx ON registration_invites(used_at);');
  await sequelize.query('CREATE INDEX IF NOT EXISTS registration_invites_revoked_at_idx ON registration_invites(revoked_at);');

  console.log('✅ Migration 005 complete');
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  });
