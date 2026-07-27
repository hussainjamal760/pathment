/**
 * Migration: 072_interview_sessions
 *
 * Phase 2 — the candidate interview runner storage. An `interview` task can be
 * attempted (once, or repeatedly if the mentor allowed retake); each attempt is
 * a session holding one answer per question.
 *
 *  - interview_sessions   one attempt at an interview assignment. Tracks status
 *                         (in_progress → submitted), timing, attempt number, and a
 *                         proctor_log (focus-loss / fullscreen-exit / paste /
 *                         snapshot events — Phase 3 fills this; stored now so no
 *                         extra migration is needed).
 *  - interview_answers    one row per (session, question). Holds the spoken
 *                         transcript + audio URL, code, or written text, plus
 *                         per-answer timing and (nullable) grading fields the
 *                         mentor/AI fill in Phase 4. Prompt/kind are snapshotted so
 *                         later kit edits don't rewrite a candidate's history.
 *
 * Run:      node server/scripts/migrations/072_interview_sessions.js
 * Rollback: node server/scripts/migrations/072_interview_sessions.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function createTable(qi, name, spec) {
  try {
    await qi.createTable(name, spec);
    console.log(`  ✓ Created ${name}`);
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log(`  ℹ ${name} exists, skipping`);
    else throw e;
  }
}

async function addIndex(qi, table, cols, name, opts = {}) {
  try {
    await qi.addIndex(table, cols, { name, ...opts });
    console.log(`  ✓ Index ${name}`);
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log(`  ℹ Index ${name} exists`);
    else throw e;
  }
}

const now = () => Sequelize.fn('NOW');
const TS = () => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now() },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now() },
});

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 072: interview sessions + answers');

  await createTable(qi, 'interview_sessions', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    assigned_task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'assigned_tasks', key: 'id' }, onDelete: 'CASCADE' },
    interview_assignment_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'interview_assignments', key: 'id' }, onDelete: 'CASCADE' },
    mentee_id: { type: Sequelize.UUID, allowNull: false },
    attempt_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'in_progress' },
    started_at: { type: Sequelize.DATE, allowNull: true },
    submitted_at: { type: Sequelize.DATE, allowNull: true },
    // Array of proctor events: { type, at, meta } — Phase 3 populates.
    proctor_log: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
    meta: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    ...TS(),
  });

  await createTable(qi, 'interview_answers', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    session_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'interview_sessions', key: 'id' }, onDelete: 'CASCADE' },
    question_id: { type: Sequelize.UUID, allowNull: false },
    position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    kind: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'voice' },
    // Snapshot so later kit edits don't rewrite a candidate's answered questions.
    prompt_snapshot: { type: Sequelize.TEXT, allowNull: true },
    points_possible: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    // Answer payload — one of these depending on kind (voice → transcript+audio).
    transcript: { type: Sequelize.TEXT, allowNull: true },
    audio_url: { type: Sequelize.TEXT, allowNull: true },
    audio_public_id: { type: Sequelize.TEXT, allowNull: true },
    code: { type: Sequelize.TEXT, allowNull: true },
    code_language: { type: Sequelize.STRING(30), allowNull: true },
    answer_text: { type: Sequelize.TEXT, allowNull: true },
    time_spent_seconds: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    // Grading (Phase 4) — mentor is source of truth; ai_draft is optional assist.
    points_awarded: { type: Sequelize.INTEGER, allowNull: true },
    score_note: { type: Sequelize.TEXT, allowNull: true },
    ai_draft: { type: Sequelize.JSONB, allowNull: true },
    ...TS(),
  });

  await addIndex(qi, 'interview_sessions', ['assigned_task_id'], 'interview_sessions_task_idx');
  await addIndex(qi, 'interview_sessions', ['mentee_id'], 'interview_sessions_mentee_idx');
  await addIndex(qi, 'interview_sessions', ['status'], 'interview_sessions_status_idx');
  await addIndex(qi, 'interview_answers', ['session_id'], 'interview_answers_session_idx');
  await addIndex(qi, 'interview_answers', ['session_id', 'question_id'], 'interview_answers_session_question_idx', { unique: true });

  console.log('✅ Migration 072 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 072');
  for (const t of ['interview_answers', 'interview_sessions']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 072 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
