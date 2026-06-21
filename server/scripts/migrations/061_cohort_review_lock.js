/**
 * Migration: 061_cohort_review_lock
 *
 * Cohort-review deletion lock. When an org turns the lock ON (a flag stored in
 * system_settings, key `cohort_review_delete_locked` — NO column here), mentors
 * can no longer delete or reopen finished review sessions unless they hold an
 * active grant. A mentor asks for one via an unlock REQUEST; an admin approves
 * it, which mints a time-boxed GRANT. These two tables back that flow.
 *
 *   cohort_review_unlock_requests — a mentor's ask (pending/approved/declined/cancelled)
 *   cohort_review_unlock_grants   — the time-boxed permission an admin issues
 *
 * Run:      node server/scripts/migrations/061_cohort_review_lock.js
 * Rollback: node server/scripts/migrations/061_cohort_review_lock.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 061: cohort review deletion lock');

  try {
    await qi.createTable('cohort_review_unlock_requests', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentor_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE',
      },
      session_id: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: 'cohort_review_sessions', key: 'id' }, onDelete: 'SET NULL',
      },
      reason: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      reviewed_by: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
      },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      decision_note: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    console.log('  ✓ Created cohort_review_unlock_requests');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ cohort_review_unlock_requests exists, skipping');
    else throw e;
  }

  try {
    await qi.createTable('cohort_review_unlock_grants', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentor_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE',
      },
      granted_by: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
      },
      request_id: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: 'cohort_review_unlock_requests', key: 'id' }, onDelete: 'SET NULL',
      },
      reason: { type: Sequelize.TEXT, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    console.log('  ✓ Created cohort_review_unlock_grants');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ cohort_review_unlock_grants exists, skipping');
    else throw e;
  }

  // Indexes (idempotent — Postgres "already exists" is swallowed).
  const addIndex = async (table, fields, name) => {
    try {
      await qi.addIndex(table, fields, { name });
      console.log(`  ✓ Index ${name}`);
    } catch (e) {
      if (/already exists/i.test(e.message)) console.log(`  ℹ Index ${name} exists, skipping`);
      else throw e;
    }
  };
  await addIndex('cohort_review_unlock_requests', ['mentor_id'], 'crur_mentor_id_idx');
  await addIndex('cohort_review_unlock_requests', ['status'], 'crur_status_idx');
  await addIndex('cohort_review_unlock_grants', ['mentor_id'], 'crug_mentor_id_idx');
  await addIndex('cohort_review_unlock_grants', ['expires_at'], 'crug_expires_at_idx');

  console.log('✅ Migration 061 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 061');
  // Grants first — they FK the requests table.
  try { await qi.dropTable('cohort_review_unlock_grants'); console.log('  ✓ Dropped cohort_review_unlock_grants'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  try { await qi.dropTable('cohort_review_unlock_requests'); console.log('  ✓ Dropped cohort_review_unlock_requests'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  console.log('✅ Rollback 061 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
