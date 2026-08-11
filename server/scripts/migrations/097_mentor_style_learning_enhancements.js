const { Sequelize } = require('sequelize');
const { sequelize } = require('../../src/db');

async function up() {
  console.log('▶ Running migration 097: Add style learning enhancement fields');
  try {
    const qi = sequelize.getQueryInterface();
    
    // Add vocabulary_preferences column
    await qi.addColumn('mentor_style_profiles', 'vocabulary_preferences', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {}
    });
    console.log('✅ Added vocabulary_preferences column');
    
    // Add phrase_patterns column
    await qi.addColumn('mentor_style_profiles', 'phrase_patterns', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: []
    });
    console.log('✅ Added phrase_patterns column');
    
    // Add style_examples column
    await qi.addColumn('mentor_style_profiles', 'style_examples', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: []
    });
    console.log('✅ Added style_examples column');
    
    // Fix tone column default value (was {} but should be { brevity: 0.5, formality: 0.5 })
    await sequelize.query(`
      ALTER TABLE mentor_style_profiles 
      ALTER COLUMN tone SET DEFAULT '{"brevity": 0.5, "formality": 0.5}'::jsonb
    `);
    console.log('✅ Updated tone column default value');
    
    console.log('✅ Migration 097 complete');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('⚠️ Columns already exist, skipping.');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }
}

async function down() {
  console.log('◀ Rolling back migration 097: Remove style learning enhancement fields');
  try {
    const qi = sequelize.getQueryInterface();
    
    await qi.removeColumn('mentor_style_profiles', 'vocabulary_preferences');
    await qi.removeColumn('mentor_style_profiles', 'phrase_patterns');
    await qi.removeColumn('mentor_style_profiles', 'style_examples');
    
    // Revert tone default
    await sequelize.query(`
      ALTER TABLE mentor_style_profiles 
      ALTER COLUMN tone SET DEFAULT '{}'::jsonb
    `);
    
    console.log('✅ Rollback 097 complete');
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
