const { Sequelize } = require('sequelize');

module.exports = {
  up: async (sequelize) => {
    const qi = sequelize.getQueryInterface();
    console.log('▶ Running migration 093: Add processed column to mentor_edit_histories');

    await qi.addColumn('mentor_edit_histories', 'processed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    console.log('  ✓ Added processed column to mentor_edit_histories');
  },

  down: async (sequelize) => {
    const qi = sequelize.getQueryInterface();
    await qi.removeColumn('mentor_edit_histories', 'processed');
    console.log('  ✓ Removed processed column from mentor_edit_histories');
  }
};
