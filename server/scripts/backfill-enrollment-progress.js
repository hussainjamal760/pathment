/* One-off backfill: recompute every enrollment's task stats with the corrected
 * progress math. This heals enrollments that the OLD buggy math left stuck at a
 * false 100% / pending_completion while real tasks were still outstanding.
 * It only reverts SYSTEM-flagged pending_completion (updateEnrollmentTaskStats
 * never touches mentor-approved program_completed or human-requested ones).
 * Run: node scripts/backfill-enrollment-progress.js   [--dry]
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const taskService = require('../src/services/taskService');

const DRY = process.argv.includes('--dry');

(async () => {
  let changed = 0, healed = 0, total = 0;
  try {
    const enrollments = await models.Enrollment.findAll({ attributes: ['id', 'status', 'overallProgressPercentage', 'completionRequestedByRole'] });
    total = enrollments.length;
    console.log(`▶ Recomputing ${total} enrollment(s)${DRY ? ' (dry run)' : ''}…`);

    for (const e of enrollments) {
      const beforeStatus = e.status;
      const beforePct = Math.round(Number(e.overallProgressPercentage) || 0);
      if (DRY) {
        // Re-derive what the new math would say without writing.
        const tasks = await models.AssignedTask.findAll({ where: { enrollmentId: e.id }, attributes: ['status'] });
        const live = tasks.filter((t) => t.status !== 'cancelled');
        const done = live.filter((t) => t.status === 'completed').length;
        const pct = live.length ? Math.round((done / live.length) * 100) : 0;
        const wouldRevert = beforeStatus === 'pending_completion' && e.completionRequestedByRole === 'system' && !(live.length > 0 && done >= live.length);
        if (pct !== beforePct || wouldRevert) {
          changed++;
          if (wouldRevert) healed++;
          console.log(`  • ${e.id}: ${beforePct}%→${pct}% ${beforeStatus}${wouldRevert ? '→active (healed)' : ''}`);
        }
        continue;
      }
      const stats = await taskService.updateEnrollmentTaskStats(e.id);
      const fresh = await models.Enrollment.findByPk(e.id, { attributes: ['status', 'overallProgressPercentage'] });
      const afterPct = Math.round(Number(fresh.overallProgressPercentage) || 0);
      if (fresh.status !== beforeStatus || afterPct !== beforePct) {
        changed++;
        if (beforeStatus === 'pending_completion' && fresh.status === 'active') healed++;
        console.log(`  • ${e.id}: ${beforePct}%→${afterPct}% ${beforeStatus}→${fresh.status}`);
      }
      void stats;
    }

    console.log(`\n✅ Done. ${total} checked, ${changed} updated, ${healed} healed from stuck pending_completion.`);
  } catch (err) {
    console.error('❌ Backfill failed:', err.message, err.stack);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
