/**
 * Migration: 096_mentor_auto_reply_setting
 *
 * Adds auto_reply_enabled boolean to mentor_style_profiles to allow mentors 
 * to opt-in or opt-out of unsupervised AI auto-replies.
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  console.log('▶ Running migration 096: Add auto_reply_enabled to mentor_style_profiles');
  try {
    const qi = sequelize.getQueryInterface();
    await qi.addColumn('mentor_style_profiles', 'auto_reply_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    console.log('✅ Migration 096 complete');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('⚠️ Column already exists, skipping.');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }
}

async function down() {
  console.log('◀ Rolling back migration 096: Remove auto_reply_enabled');
  try {
    const qi = sequelize.getQueryInterface();
    await qi.removeColumn('mentor_style_profiles', 'auto_reply_enabled');
    console.log('✅ Rollback 096 complete');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
}

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
      console.error(error);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
