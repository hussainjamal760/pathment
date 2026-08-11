'use strict';
require('dotenv').config();

async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('rag_generation_quotas', 'limit', {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 100
  });
}

async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('rag_generation_quotas', 'limit');
}

module.exports = {
  up,
  down
};

// If run directly via node scripts/migrations/098_add_rag_quota_limit.js
if (require.main === module) {
  const { sequelize } = require('../../src/db');
  const args = process.argv.slice(2);
  const isRollback = args.includes('--rollback') || args.includes('-r');

  (async () => {
    try {
      console.log(`▶ Running migration 098: ${isRollback ? 'Rollback' : 'Add'} rag_quota_limit`);
      const qi = sequelize.getQueryInterface();
      const Sequelize = sequelize.Sequelize;

      if (isRollback) {
        await down(qi, Sequelize);
      } else {
        await up(qi, Sequelize);
      }
      console.log('✅ Migration 098 complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Migration 098 failed:', error);
      process.exit(1);
    }
  })();
}
