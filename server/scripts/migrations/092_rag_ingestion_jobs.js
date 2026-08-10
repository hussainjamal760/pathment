/**
 * Migration: 092_rag_ingestion_jobs
 *
 * Creates the `rag_ingestion_jobs` table for asynchronous, 
 * atomic queue processing of RAG chunks using FOR UPDATE SKIP LOCKED.
 *
 * Run:      node server/scripts/migrations/092_rag_ingestion_jobs.js
 * Rollback: node server/scripts/migrations/092_rag_ingestion_jobs.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const now = () => Sequelize.fn('NOW');
const TS = () => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now() },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now() },
});

async function createTable(qi, name, spec) {
  try {
    await qi.createTable(name, spec);
    console.log(`  ✓ Created ${name}`);
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log(`  ℹ ${name} exists, skipping`);
    else throw e;
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 092: RAG Ingestion Jobs');

  await createTable(qi, 'rag_ingestion_jobs', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    source_type: { type: Sequelize.STRING(50), allowNull: false },
    source_id: { type: Sequelize.STRING(255), allowNull: false },
    text: { type: Sequelize.TEXT, allowNull: false },
    mentor_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    program_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'programs', key: 'id' }, onDelete: 'CASCADE' },
    visibility: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'public' },
    status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'pending' },
    attempt_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 },
    last_error: { type: Sequelize.TEXT, allowNull: true },
    last_attempt_at: { type: Sequelize.DATE, allowNull: true },
    next_attempt_at: { type: Sequelize.DATE, allowNull: true, defaultValue: now() },
    ...TS(),
  });

  console.log('  Adding indexes...');
  try {
    // Indexes to optimize the worker polling query: 
    // WHERE status='pending' AND next_attempt_at <= NOW()
    await qi.addIndex('rag_ingestion_jobs', ['status', 'next_attempt_at'], { name: 'idx_rag_ingestion_jobs_polling' });
    console.log('  ✓ Polling index added');
  } catch (e) {
    if (/already exists/i.test(e.message)) {
      console.log('  ℹ Index already exists');
    } else {
      throw e;
    }
  }

  console.log('✅ Migration 092 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('◀ Rolling back migration 092: RAG Ingestion Jobs');

  try {
    await qi.dropTable('rag_ingestion_jobs');
    console.log('  ✓ Dropped rag_ingestion_jobs');
    console.log('✅ Rollback 092 complete');
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
