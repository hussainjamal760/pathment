/* Proves the progress/completion fix: progress is measured against the mentee's
 * ACTUAL assigned tasks (incl. non-base-roadmap tasks the old code ignored), so
 * it can't read 100% / flag completion while real tasks are outstanding.
 * Run: node scripts/test-progress-math.js  (self-cleans) */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const clanService = require('../src/services/clanService');
const taskService = require('../src/services/taskService');

const TAG = `pm_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], clans: [], roadmaps: [] };

async function mkUser(first, caps) {
  const u = await models.User.create({ email: e(first), passwordHash: 'x', role: caps[0], capabilities: caps, firstName: first, lastName: 'T', emailVerified: true, status: 'active' });
  created.users.push(u.id); return u;
}

(async () => {
  try {
    const admin = await mkUser('admin', ['admin']);
    const mentor = await mkUser('mentor', ['mentor']);
    const mentee = await mkUser('mentee', ['mentee']);
    const program = await models.Program.create({ createdBy: admin.id, name: TAG + 'prog', description: 'd', type: 'mentorship', totalDurationWeeks: 12, status: 'published', visibility: 'private' });
    created.programs.push(program.id);
    const clan = await clanService.createClan({ programId: program.id, name: TAG + 'clan', leadMentorId: mentor.id }, admin.id);
    created.clans.push(clan.id);
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    const enrollment = await models.Enrollment.findOne({ where: { menteeId: mentee.id, programId: program.id } });

    // A NON-base roadmap task (the kind the old total-count ignored).
    const rm = await models.Roadmap.create({ programId: program.id, name: TAG + 'local', source: 'local', published: false, ownerMentorId: mentor.id, isBaseRoadmap: false, totalTasks: 1 });
    created.roadmaps.push(rm.id);
    const rt = await models.RoadmapTask.create({ roadmapId: rm.id, title: TAG + 'step', description: 'do', type: 'project', taskOrder: 0, isCustomTask: false, difficulty: 'medium', deliverable: 'a thing' });
    const rmTask = await models.AssignedTask.create({ roadmapTaskId: rt.id, menteeId: mentee.id, mentorId: mentor.id, enrollmentId: enrollment.id, status: 'assigned', isCustomTask: false, dueDate: new Date() });

    // Plus 3 custom tasks.
    const custom = [];
    for (let i = 0; i < 3; i++) custom.push(await taskService.createCustomTask({ menteeId: mentee.id, title: `${TAG}c${i}`, type: 'project' }, mentor.id));

    // 4 live tasks, 0 done.
    let stats = await taskService.updateEnrollmentTaskStats(enrollment.id);
    ok(stats.tasksTotal === 4, `total counts ALL 4 assigned tasks incl. non-base roadmap (got ${stats.tasksTotal})`);
    ok(stats.tasksCompleted === 0 && stats.overallProgressPercentage === 0, '0% with nothing done');

    // Complete the non-base roadmap task → 1/4 = 25%, NOT complete.
    await models.AssignedTask.update({ status: 'completed' }, { where: { id: rmTask.id } });
    stats = await taskService.updateEnrollmentTaskStats(enrollment.id);
    ok(stats.overallProgressPercentage === 25, `25% after 1 of 4 (got ${stats.overallProgressPercentage}%)`);
    let fresh = await models.Enrollment.findByPk(enrollment.id);
    ok(fresh.status !== 'pending_completion' && fresh.status !== 'program_completed', 'NOT flagged complete while 3 tasks outstanding (the bug)');

    // Complete the rest → 100% + pending_completion.
    await models.AssignedTask.update({ status: 'completed' }, { where: { id: custom.map((c) => c.id) } });
    stats = await taskService.updateEnrollmentTaskStats(enrollment.id);
    ok(stats.overallProgressPercentage === 100, '100% only when ALL assigned tasks done');
    fresh = await models.Enrollment.findByPk(enrollment.id);
    ok(fresh.status === 'pending_completion', 'flags pending_completion only at true 100%');

    // Cancelled tasks don't count against total.
    const extra = await taskService.createCustomTask({ menteeId: mentee.id, title: TAG + 'cx', type: 'project' }, mentor.id);
    await models.AssignedTask.update({ status: 'cancelled' }, { where: { id: extra.id } });
    stats = await taskService.updateEnrollmentTaskStats(enrollment.id);
    ok(stats.tasksTotal === 4 && stats.overallProgressPercentage === 100, 'cancelled task is excluded from total (stays 4/100%)');

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err.message, err.stack);
    fail++;
  } finally {
    try {
      await models.AssignedTask.destroy({ where: { menteeId: created.users } }).catch(() => {});
      const rts = await models.RoadmapTask.findAll({ include: [{ model: models.Roadmap, as: 'roadmap', where: { programId: created.programs }, required: true }] }).catch(() => []);
      await models.RoadmapTask.destroy({ where: { id: rts.map((r) => r.id) } }).catch(() => {});
      await models.RoadmapTask.destroy({ where: { roadmapId: created.roadmaps } }).catch(() => {});
      await models.Roadmap.destroy({ where: { id: created.roadmaps } }).catch(() => {});
      await models.Roadmap.destroy({ where: { programId: created.programs } }).catch(() => {});
      await models.ClanMembership.destroy({ where: { clanId: created.clans } }).catch(() => {});
      await models.Enrollment.destroy({ where: { menteeId: created.users } }).catch(() => {});
      await models.Clan.destroy({ where: { id: created.clans } }).catch(() => {});
      await models.Program.destroy({ where: { id: created.programs } }).catch(() => {});
      await models.User.destroy({ where: { id: created.users } }).catch(() => {});
      console.log('cleanup done');
    } catch (e2) { console.error('cleanup error', e2.message); }
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
