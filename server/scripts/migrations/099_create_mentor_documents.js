const { DataTypes } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.createTable('mentor_documents', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      mentor_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      file_name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      file_url: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      cloudinary_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'processing'
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });
    console.log('  ✓ Created mentor_documents table');
  } catch (e) {
    if (/already exists/i.test(e.message)) {
      console.log('  ℹ mentor_documents table already exists, skipping');
    } else {
      throw e;
    }
  }

  try {
    await queryInterface.addIndex('mentor_documents', ['mentor_id']);
    console.log('  ✓ Created mentor_id index on mentor_documents');
  } catch (e) {
    console.log('  ℹ mentor_id index already exists or failed:', e.message);
  }
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('mentor_documents');
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
