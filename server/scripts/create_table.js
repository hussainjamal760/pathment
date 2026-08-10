require('dotenv').config();
const { sequelize } = require('../src/db');
const { up } = require('./migrations/093_create_mentor_documents.js');

async function run() {
  try {
    await up(sequelize.getQueryInterface());
    console.log('Successfully created mentor_documents table.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create table:', err);
    process.exit(1);
  }
}

run();
