/* Verifies cohortService.getPeriodActivity windows correctly for week vs month.
 * Run: node scripts/test-period-activity.js  (self-cleans) */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const clanService = require('../src/services/clanService');
const taskService = require('../src/services/taskService');
const cohortService = require('../src/services/cohortService');

const TAG = `pa_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], clans: [] };
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function mkUser(first, caps) {
  const u = await models.User.create({ email: e(first), passwordHash: 'x', role: caps[0], capabilities: caps, firstName: first, lastName: 'T', emailVerified: true, status: 'active' });
  created.users.push(u.id); return u;
}
// Create a completed task at a given completedAt + lateness.
async function completedTask(menteeId, mentorId, daysBack, isLate) {
  const t = await taskService.createCustomTask({ menteeId, title: TAG + 'task', type: 'project' }, mentorId);
  await models.AssignedTask.update(
    { status: 'completed', isLate, pointsAwarded: 10, completedAt: daysAgo(daysBack) },
    { where: { id: t.id } }
  );
  return t;
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

    // 3 tasks inside the week (2 on time, 1 late); 1 task at 20 days (inside month, outside week).
    await completedTask(mentee.id, mentor.id, 2, false);
    await completedTask(mentee.id, mentor.id, 4, false);
    await completedTask(mentee.id, mentor.id, 6, true);
    await completedTask(mentee.id, mentor.id, 20, false);
    // 1 task at 40 days — outside both windows.
    await completedTask(mentee.id, mentor.id, 40, false);

    // Blockers: 1 opened 3 days ago (in week), 1 opened 15 days ago (in month), 1 resolved 2 days ago.
    await models.Blocker.create({ menteeId: mentee.id, title: TAG + 'b1', openedAt: daysAgo(3), status: 'open' });
    await models.Blocker.create({ menteeId: mentee.id, title: TAG + 'b2', openedAt: daysAgo(15), status: 'open' });
    await models.Blocker.create({ menteeId: mentee.id, title: TAG + 'b3', openedAt: daysAgo(10), resolvedAt: daysAgo(2), status: 'resolved' });

    const week = await cohortService.getPeriodActivity(mentor.id, 'week');
    ok(week.days === 7, 'week window = 7 days');
    ok(week.tasksCompleted === 3, `week: 3 tasks completed (got ${week.tasksCompleted})`);
    ok(week.onTime === 2 && week.onTimeRate === 67, `week: 2 on time, 67% (got ${week.onTime}/${week.onTimeRate})`);
    ok(week.blockersOpened === 1, `week: 1 blocker opened (got ${week.blockersOpened})`);
    ok(week.blockersResolved === 1, `week: 1 blocker resolved (got ${week.blockersResolved})`);
    ok(week.activeMentees === 1 && week.totalMentees === 1, 'week: 1/1 active mentees');

    const month = await cohortService.getPeriodActivity(mentor.id, 'month');
    ok(month.days === 30, 'month window = 30 days');
    ok(month.tasksCompleted === 4, `month: 4 tasks completed (got ${month.tasksCompleted})`);
    ok(month.blockersOpened === 3, `month: 3 blockers opened — all within 30d (got ${month.blockersOpened})`);
    ok(month.blockersResolved === 1, `month: 1 blocker resolved (got ${month.blockersResolved})`);
    ok(month.tasksCompleted > week.tasksCompleted, 'month window strictly includes more than week (toggle is real)');

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err.message, err.stack);
    fail++;
  } finally {
    try {
      await models.Blocker.destroy({ where: { menteeId: created.users } }).catch(() => {});
      await models.AssignedTask.destroy({ where: { menteeId: created.users } }).catch(() => {});
      const rts = await models.RoadmapTask.findAll({ include: [{ model: models.Roadmap, as: 'roadmap', where: { programId: created.programs }, required: true }] }).catch(() => []);
      await models.RoadmapTask.destroy({ where: { id: rts.map((r) => r.id) } }).catch(() => {});
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
