/* E2E for batch 3: roadmap-assign self-heal, org schedule templates + mentor
 * import, enrollment clan attach. Run: node scripts/test-batch3.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const clanService = require('../src/services/clanService');
const roadmaps = require('../src/services/linearRoadmapService');
const schedules = require('../src/services/scheduleTemplateService');
const enrollments = require('../src/services/enrollmentService');

const TAG = `batch3_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], clans: [], roadmaps: [], templates: [] };

async function mkUser(first, caps) {
  const u = await models.User.create({ email: e(first), passwordHash: 'x', role: caps[0], capabilities: caps, firstName: first, lastName: 'T', emailVerified: true, status: 'active' });
  created.users.push(u.id); return u;
}

(async () => {
  try {
    const admin = await mkUser('admin', ['admin']);
    const mentor = await mkUser('mentor', ['mentor']);
    const menteeA = await mkUser('menteeA', ['mentee']); // clan-placed (has enrollment)
    const menteeB = await mkUser('menteeB', ['mentee']); // NO enrollment (tests self-heal)

    const program = await models.Program.create({ createdBy: admin.id, name: TAG + 'prog', description: 'd', type: 'mentorship', totalDurationWeeks: 12, status: 'published', visibility: 'private' });
    created.programs.push(program.id);
    const clan = await clanService.createClan({ programId: program.id, name: TAG + 'clan', leadMentorId: mentor.id }, admin.id);
    created.clans.push(clan.id);
    await clanService.addMember(clan.id, { userId: menteeA.id, role: 'mentee' });

    // ── Enrollment list attaches clan (item 3) ───────────────────────────────
    const list = await enrollments.getEnrollments({ programId: program.id }, { page: 1, limit: 50 });
    const rowA = list.enrollments.find((r) => r.menteeId === menteeA.id);
    ok(rowA && rowA.getDataValue('clan')?.name === clan.name, 'enrollment list attaches the mentee clan');

    // ── Roadmap assign self-heal (item 7) ────────────────────────────────────
    const rm = await roadmaps.createRoadmap(mentor.id, { name: TAG + 'rm', programId: program.id, steps: [{ title: 'Step 1', type: 'project' }] });
    created.roadmaps.push(rm.id);
    const enrBefore = await models.Enrollment.count({ where: { menteeId: menteeB.id } });
    ok(enrBefore === 0, 'menteeB starts with no enrollment');
    const res = await roadmaps.bulkAssign(mentor.id, rm.id, [menteeA.id, menteeB.id], 0);
    ok(res.every((r) => r.ok), 'roadmap assigns to BOTH mentees (self-heals the missing enrollment)');
    const enrAfter = await models.Enrollment.count({ where: { menteeId: menteeB.id } });
    ok(enrAfter === 1, 'menteeB now has an auto-created enrollment');
    const progB = await models.RoadmapProgress.findOne({ where: { roadmapId: rm.id, menteeId: menteeB.id } });
    ok(Boolean(progB), 'roadmap progress created for the self-healed mentee');

    // ── Org schedule templates + mentor import (item 6) ───────────────────────
    const orgT = await schedules.createOrgTemplate(admin.id, { name: TAG + 'orgtpl', blocks: [{ label: 'Standup', time: '9:00 AM', days: 'weekdays' }] });
    created.templates.push(orgT.id);
    ok(orgT.source === 'org', 'admin creates a source=org schedule template');
    const orgList = await schedules.listOrgTemplates();
    ok(orgList.some((t) => t.id === orgT.id), 'org template appears in the org library');

    const mentorView = await schedules.listForMentor(mentor.id);
    ok(mentorView.org.some((t) => t.id === orgT.id), 'mentor sees the org template in their "From your organization" list');
    const imported = await schedules.importTemplate(mentor.id, orgT.id);
    created.templates.push(imported.id);
    ok(imported.source === 'mentor' && imported.ownerMentorId === mentor.id, 'mentor inherits/imports it as their own copy');

    // ── Recurring slot reaches the mentee (item 6 flow) ───────────────────────
    await schedules.assignToMentees(imported.id, [menteeA.id], mentor.id);
    const slotId = imported.blocks[0].id;
    await schedules.updateSlot(menteeA.id, slotId, { kind: 'recurring', recurring: { title: 'Daily journal', type: 'reflection', recurrence: 'daily' } }, mentor.id);
    const sched = await schedules.getMenteeSchedule(menteeA.id);
    const slot = sched.schedule.find((s) => s.id === slotId);
    ok(slot && slot.kind === 'recurring' && slot.recurring?.title === 'Daily journal', 'mentor fills a slot with a recurring ritual that lands on the mentee schedule');

    await schedules.deleteOrgTemplate(orgT.id);
    created.templates = created.templates.filter((id) => id !== orgT.id);
    ok(!(await schedules.listOrgTemplates()).some((t) => t.id === orgT.id), 'admin can delete an org template');

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err.message, err.stack);
    fail++;
  } finally {
    try {
      await models.MenteeSchedule.destroy({ where: { menteeId: created.users } }).catch(() => {});
      await models.ScheduleTemplate.destroy({ where: { id: created.templates } }).catch(() => {});
      await models.RoadmapProgress.destroy({ where: { menteeId: created.users } }).catch(() => {});
      await models.AssignedTask.destroy({ where: { menteeId: created.users } }).catch(() => {});
      await models.RoadmapTask.destroy({ where: { roadmapId: created.roadmaps } }).catch(() => {});
      await models.Roadmap.destroy({ where: { id: created.roadmaps } }).catch(() => {});
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
