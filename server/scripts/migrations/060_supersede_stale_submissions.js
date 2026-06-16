/**
 * Migration: 060_supersede_stale_submissions
 *
 * Data cleanup (no schema change). A mentee can resubmit / request an extension
 * before review; each creates a NEW task_submissions row with an incremented
 * `version`, but older versions were left at status='pending' forever. The mentor
 * approvals queue listed every pending row, so the same task appeared once per
 * version (the "duplicate tasks" bug). The queue now collapses to the latest
 * version at read time, but the stale rows still sit in the DB inflating any
 * status='pending' count.
 *
 * This marks every NON-latest pending submission as 'superseded' (one row per
 * assignment stays pending — the highest version). Idempotent: re-running finds
 * nothing left to update. No rollback (we can't know which were genuinely the
 * "old" pending rows once collapsed); down() is a safe no-op.
 *
 * Run:      node server/scripts/migrations/060_supersede_stale_submissions.js
 * Rollback: node server/scripts/migrations/060_supersede_stale_submissions.js --rollback  (no-op)
 */
const sequelize = require('./_db');

async function up() {
  console.log('▶ Running migration 060: supersede stale pending submissions');

  // For each assigned_task_id, the highest version among its pending rows is the
  // live one; every other pending row for that task is stale → supersede it.
  const [result] = await sequelize.query(`
    UPDATE task_submissions ts
    SET status = 'superseded'
    WHERE ts.status = 'pending'
      AND ts.version < (
        SELECT MAX(inner_ts.version)
        FROM task_submissions inner_ts
        WHERE inner_ts.assigned_task_id = ts.assigned_task_id
          AND inner_ts.status = 'pending'
      )
  `);

  const affected = result?.rowCount ?? result?.affectedRows ?? 0;
  console.log(`  ✓ Superseded ${affected} stale pending submission(s)`);
  console.log('✅ Migration 060 complete');
}

async function down() {
  // No reliable rollback: once collapsed we can't tell which 'superseded' rows
  // were originally 'pending' vs already-superseded. Intentional no-op.
  console.log('ℹ Migration 060 has no rollback (data cleanup) — no-op');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
