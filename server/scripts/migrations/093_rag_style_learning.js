const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 093: Add processed column to mentor_edit_histories');

  try {
    await qi.addColumn('mentor_edit_histories', 'processed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    console.log('  ✓ Added processed column to mentor_edit_histories');
  } catch (e) {
    if (/already exists/i.test(e.message) || /column "processed" of relation "mentor_edit_histories" already exists/i.test(e.message)) {
      console.log('  ℹ Column "processed" already exists, skipping');
    } else {
      throw e;
    }
  }
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('mentor_edit_histories', 'processed');
  console.log('  ✓ Removed processed column from mentor_edit_histories');
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
