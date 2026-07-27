/**
 * Migration: 071_interview_tasks
 *
 * Interview-type tasks (Phase 1 — authoring + assignment foundation). A mentor
 * authors a reusable **Interview Kit** (an ordered set of questions) and assigns
 * it to a mentee as an `interview` task. The candidate later answers by voice /
 * code / text (Phase 2 runner) and the mentor grades it (Phase 4).
 *
 *  - interview_kits         reusable interview definition (author once, assign many).
 *  - interview_questions     one row per question in a kit (voice | code | text),
 *                            each with its own time limit + points + hidden
 *                            reference answer (for the mentor / optional AI only).
 *  - interview_assignments   1:1 with an assigned_task of type 'interview'. Snapshots
 *                            the per-assignment options the mentor set at assign time
 *                            (retake allowed?, camera required?, AI grading?, timing)
 *                            so later kit edits don't silently change an assignment.
 *
 * `roadmap_tasks.type` gains the value 'interview' (app-level enum in the model —
 * the column is already STRING(20), so no DB constraint change is needed here).
 *
 * Run:      node server/scripts/migrations/071_interview_tasks.js
 * Rollback: node server/scripts/migrations/071_interview_tasks.js --rollback
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
  console.log('▶ Running migration 071: interview tasks (kits + questions + assignments)');

  await createTable(qi, 'interview_kits', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    title: { type: Sequelize.STRING(255), allowNull: false },
    description: { type: Sequelize.TEXT, allowNull: true },
    created_by: { type: Sequelize.UUID, allowNull: false },
    // Optional reuse scoping (a program's mentors share the kit). Null = personal.
    program_id: { type: Sequelize.UUID, allowNull: true },
    clan_id: { type: Sequelize.UUID, allowNull: true },
    // 'per_question' → each question carries its own timer; 'total' → one clock
    // for the whole interview (total_seconds).
    timing_mode: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'per_question' },
    total_seconds: { type: Sequelize.INTEGER, allowNull: true },
    // Defaults the assign drawer pre-fills (overridable per assignment).
    camera_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    ai_grading_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    allow_retake_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'draft' },
    settings: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    ...TS(),
  });

  await createTable(qi, 'interview_questions', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    kit_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'interview_kits', key: 'id' }, onDelete: 'CASCADE' },
    position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    // How it's answered: spoken answer (voice), code editor (code), typed (text).
    kind: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'voice' },
    prompt: { type: Sequelize.TEXT, allowNull: false },
    // Per-question clock (seconds). Null under 'total' timing.
    time_limit_seconds: { type: Sequelize.INTEGER, allowNull: true },
    points: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 10 },
    required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    // Code questions only.
    code_language: { type: Sequelize.STRING(30), allowNull: true },
    starter_code: { type: Sequelize.TEXT, allowNull: true },
    // Model answer / rubric — for the mentor (and optional AI) ONLY; never sent
    // to the candidate.
    reference_answer: { type: Sequelize.TEXT, allowNull: true },
    config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    ...TS(),
  });

  await createTable(qi, 'interview_assignments', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    assigned_task_id: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'assigned_tasks', key: 'id' }, onDelete: 'CASCADE' },
    kit_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'interview_kits', key: 'id' }, onDelete: 'RESTRICT' },
    // Per-assignment options snapshot (the mentor set these at assign time).
    allow_retake: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    camera_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    ai_grading_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    timing_mode: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'per_question' },
    total_seconds: { type: Sequelize.INTEGER, allowNull: true },
    ...TS(),
  });

  await addIndex(qi, 'interview_kits', ['created_by'], 'interview_kits_created_by_idx');
  await addIndex(qi, 'interview_kits', ['program_id'], 'interview_kits_program_idx');
  await addIndex(qi, 'interview_kits', ['status'], 'interview_kits_status_idx');
  await addIndex(qi, 'interview_questions', ['kit_id'], 'interview_questions_kit_idx');
  await addIndex(qi, 'interview_assignments', ['assigned_task_id'], 'interview_assignments_task_idx', { unique: true });
  await addIndex(qi, 'interview_assignments', ['kit_id'], 'interview_assignments_kit_idx');

  console.log('✅ Migration 071 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 071');
  for (const t of ['interview_assignments', 'interview_questions', 'interview_kits']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 071 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
