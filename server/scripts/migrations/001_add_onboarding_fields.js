/**
 * Migration: Add onboarding fields to users table
 * Run this script: node scripts/migrations/001_add_onboarding_fields.js
 */

const { sequelize } = require('../../src/db');

async function up() {
  console.log('Running migration: Add onboarding fields to users table...');

  try {
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
    `);

    console.log('✅ Migration completed successfully!');
    console.log('   - Added profile_completed column');
    console.log('   - Added onboarding_step column');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('Rolling back migration: Remove onboarding fields from users table...');

  try {
    await sequelize.query(`
      ALTER TABLE users 
      DROP COLUMN IF EXISTS profile_completed,
      DROP COLUMN IF EXISTS onboarding_step;
    `);

    console.log('✅ Rollback completed successfully!');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
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
      console.error(error);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
