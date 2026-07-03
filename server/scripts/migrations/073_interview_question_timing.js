/**
 * Migration: 073_interview_question_timing
 *
 * Server-authoritative interview timing (wall-clock). Until now the per-question
 * countdown lived only in the browser, so a refresh restarted the clock. We now
 * record when each question was actually started and where the candidate is, so
 * remaining time is computed from the real clock and resumes correctly.
 *
 *  - interview_answers.started_at        when the candidate first landed on this
 *                                        question (deadline = started_at + limit).
 *  - interview_sessions.current_position the question index the candidate is on,
 *                                        so resume returns them there (not to Q1).
 *
 * Run:      node server/scripts/migrations/073_interview_question_timing.js
 * Rollback: node server/scripts/migrations/073_interview_question_timing.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function addColumn(qi, table, column, spec) {
  try {
    await qi.addColumn(table, column, spec);
    console.log(`  ✓ Added ${table}.${column}`);
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${column} exists, skipping`);
    else throw e;
  }
}

async function removeColumn(qi, table, column) {
  try {
    await qi.removeColumn(table, column);
    console.log(`  ✓ Dropped ${table}.${column}`);
  } catch (e) {
    if (!/does not exist|no such column/i.test(e.message)) throw e;
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 073: interview question timing');

  await addColumn(qi, 'interview_answers', 'started_at', { type: Sequelize.DATE, allowNull: true });
  await addColumn(qi, 'interview_sessions', 'current_position', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });

  console.log('✅ Migration 073 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 073');
  await removeColumn(qi, 'interview_answers', 'started_at');
  await removeColumn(qi, 'interview_sessions', 'current_position');
  console.log('✅ Rollback 073 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
