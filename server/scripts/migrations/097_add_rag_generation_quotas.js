'use strict';
require('dotenv').config();

async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('rag_generation_quotas', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    mentor_id: {
      type: Sequelize.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    count: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    window_start: {
      type: Sequelize.DATE,
      allowNull: false
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false
    }
  });
}

async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable('rag_generation_quotas');
}

module.exports = {
  up,
  down
};

// If run directly via node scripts/migrations/097_add_rag_generation_quotas.js
if (require.main === module) {
  const { sequelize } = require('../../src/db');
  const args = process.argv.slice(2);
  const isRollback = args.includes('--rollback') || args.includes('-r');

  (async () => {
    try {
      console.log(`▶ Running migration 097: ${isRollback ? 'Rollback' : 'Create'} rag_generation_quotas`);
      const qi = sequelize.getQueryInterface();
      const Sequelize = sequelize.Sequelize;

      if (isRollback) {
        await down(qi, Sequelize);
      } else {
        await up(qi, Sequelize);
      }
      console.log('✅ Migration 097 complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Migration 097 failed:', error);
      process.exit(1);
    }
  })();
}
