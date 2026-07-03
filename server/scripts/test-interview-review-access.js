/* eslint-disable no-console */
// Co-mentor interview-review access check against a real DB.
// Proves a co-mentor can review interviews with lead parity, that the per-clan
// TASK_REVIEW deny-list blocks them, and that outsiders/other-clan mentors can't.
//
// Run with: DATABASE_URL=... DB_SSL=false node scripts/test-interview-review-access.js
const { sequelize, models } = require('../src/db');
const clanService = require('../src/services/clanService');
const taskService = require('../src/services/taskService');
const interviewKitService = require('../src/services/interviewKitService');
const interviewSessionService = require('../src/services/interviewSessionService');
const { PERMISSIONS } = require('../src/config/permissions');
const { ForbiddenError } = require('../src/utils/errors/errorTypes');

let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}`); };

const stamp = Date.now();
const created = { users: [], programs: [], clans: [], enrollments: [], kits: [], tasks: [] };

async function mkUser(role, n) {
  const u = await models.User.create({
    email: `iv-${role}${n}-${stamp}@test.local`, passwordHash: 'x', role,
    firstName: role, lastName: `#${n}`, status: 'active', emailVerified: true,
  });
  created.users.push(u.id);
  return u;
}

/** True if `userId` may open the interview review for `taskId`; false on Forbidden. */
async function canReview(taskId, userId) {
  try {
    await interviewSessionService.getForReview(taskId, userId);
    return true;
  } catch (e) {
    if (e instanceof ForbiddenError) return false;
    throw e; // NotFound / anything else is a real failure — surface it
  }
}

(async () => {
  await sequelize.authenticate();

  // ── Cast: a program, clan A (lead + co-mentor + mentee), clan B (other co) ──
  const lead = await mkUser('mentor', 1);
  const program = await models.Program.create({
    createdBy: lead.id, name: `IV Prog ${stamp}`, description: 'Interview access test',
    type: 'mentorship', status: 'published', totalDurationWeeks: 8,
  });
  created.programs.push(program.id);

  const clanA = await models.Clan.create({ name: 'IV Clan A', programId: program.id, leadMentorId: lead.id, createdBy: lead.id, status: 'active' });
  const clanB = await models.Clan.create({ name: 'IV Clan B', programId: program.id, leadMentorId: lead.id, createdBy: lead.id, status: 'active' });
  created.clans.push(clanA.id, clanB.id);
  await clanService.addMember(clanA.id, { userId: lead.id, role: 'lead_mentor' });

  const co = await mkUser('mentee', 1);           // becomes a co-mentor of clan A
  const outsiderCo = await mkUser('mentee', 2);   // a co-mentor of clan B only
  const mentee = await mkUser('mentee', 3);       // the candidate, in clan A
  const otherMentee = await mkUser('mentee', 4);  // an unrelated mentee (not owner)

  for (const u of [co, outsiderCo, mentee, otherMentee]) {
    const enr = await models.Enrollment.create({ menteeId: u.id, programId: program.id, status: 'active', enrolledAt: new Date() });
    created.enrollments.push(enr.id);
  }
  await clanService.addMember(clanA.id, { userId: co.id, role: 'co_mentor' });
  await clanService.addMember(clanB.id, { userId: outsiderCo.id, role: 'co_mentor' });
  await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });

  // ── Author a tiny kit + assign it as an interview task to the mentee ────────
  const kit = await interviewKitService.createKit(lead.id, {
    title: 'Access-check kit',
    questions: [{ kind: 'text', prompt: 'Why do you want this role?', points: 10 }],
  });
  created.kits.push(kit.id);

  const task = await taskService.createCustomTask({
    menteeId: mentee.id, type: 'interview', title: 'Screening interview',
    difficulty: 'medium', interview: { kitId: kit.id },
  }, lead.id);
  created.tasks.push(task.id);
  ok('interview task assigned (type=interview)', task.roadmapTask?.type === 'interview');

  // ── Mentee takes + submits it ───────────────────────────────────────────────
  const session = await interviewSessionService.startOrResume(task.id, mentee.id);
  await interviewSessionService.saveAnswer(session.id, mentee.id, kit.questions[0].id, { answerText: 'Because I love building.' });
  await interviewSessionService.submit(session.id, mentee.id);
  const freshTask = await models.AssignedTask.findByPk(task.id);
  ok('mentee submit → task status submitted', freshTask.status === 'submitted');

  // ── Access matrix ───────────────────────────────────────────────────────────
  ok('lead mentor CAN review the interview', await canReview(task.id, lead.id));
  ok('co-mentor CAN review (default lead parity)', await canReview(task.id, co.id));
  ok('other-clan co-mentor CANNOT review', !(await canReview(task.id, outsiderCo.id)));
  ok('owning mentee CAN open (read-only)', await canReview(task.id, mentee.id));
  ok('unrelated mentee CANNOT open', !(await canReview(task.id, otherMentee.id)));

  // Grading + finalize are gated the same way for the co-mentor.
  let coGrade = false;
  try { await interviewSessionService.gradeAnswer(task.id, co.id, kit.questions[0].id, { pointsAwarded: 8 }); coGrade = true; } catch { /* */ }
  ok('co-mentor CAN grade an answer', coGrade);

  // ── Revoke TASK_REVIEW for THIS co-mentor in clan A ─────────────────────────
  await clanService.setMemberPermissions(clanA.id, co.id, [PERMISSIONS.TASK_REVIEW], lead.id);
  ok('co-mentor BLOCKED from review after lead revokes task.review', !(await canReview(task.id, co.id)));
  ok('lead mentor STILL can review (revoke is per co-mentor)', await canReview(task.id, lead.id));

  let coGradeBlocked = false;
  try { await interviewSessionService.gradeAnswer(task.id, co.id, kit.questions[0].id, { pointsAwarded: 5 }); }
  catch (e) { coGradeBlocked = e instanceof ForbiddenError; }
  ok('co-mentor BLOCKED from grading after revoke', coGradeBlocked);

  let coFinalizeBlocked = false;
  try { await interviewSessionService.finalizeReview(task.id, co.id, { overallNote: 'x' }); }
  catch (e) { coFinalizeBlocked = e instanceof ForbiddenError; }
  ok('co-mentor BLOCKED from finalizing after revoke', coFinalizeBlocked);

  // ── Restore ─────────────────────────────────────────────────────────────────
  await clanService.setMemberPermissions(clanA.id, co.id, [], lead.id);
  ok('co-mentor RESTORED after re-enable', await canReview(task.id, co.id));

  // ── Cleanup (best-effort; FK cascades handle children) ──────────────────────
  try {
    await models.InterviewSession.destroy({ where: { assignedTaskId: { [require('sequelize').Op.in]: created.tasks } } });
    await models.TaskSubmission.destroy({ where: { assignedTaskId: { [require('sequelize').Op.in]: created.tasks } } });
    await models.InterviewAssignment.destroy({ where: { assignedTaskId: { [require('sequelize').Op.in]: created.tasks } } });
    await models.AssignedTask.destroy({ where: { id: created.tasks } });
    for (const kitId of created.kits) { await models.InterviewQuestion.destroy({ where: { kitId } }); }
    await models.InterviewKit.destroy({ where: { id: created.kits } });
    await models.ClanMembership.destroy({ where: { clanId: created.clans } });
    await models.Enrollment.destroy({ where: { id: created.enrollments } });
    await models.Clan.destroy({ where: { id: created.clans } });
    await models.RoadmapTask.destroy({ where: { isCustomTask: true, title: 'Screening interview' } });
    await models.Program.destroy({ where: { id: created.programs } });
    await models.User.destroy({ where: { id: created.users } });
    console.log('  ✓ cleaned up test rows');
  } catch (e) {
    console.log('  ⚠ cleanup skipped:', e.message);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await sequelize.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('❌ Check crashed:', e); process.exit(1); });
