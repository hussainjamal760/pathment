/**
 * Demo data for selection pools, on top of `npm run seed:demo`.
 *
 * One pool in the demo programme with 24 candidates at every stage: reviewed,
 * waiting for review, changes requested, in progress, not started, and three
 * invites nobody has accepted yet. Everything goes through poolService and
 * submissionService, so the demo exercises the same paths the product does.
 *
 * Re-running replaces the demo pool. Candidates log in with Demo@1234,
 * e.g. candidate.01@demo.pathment.com.
 *
 * Run: npm run seed:pool
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const { sequelize, models } = require('../src/db');
const { runWithRequestContext } = require('../src/utils/auditContext');

const POOL_NAME = 'Fellowship 2027 intake (demo)';
const PASSWORD = 'Demo@1234';
const NAMES = [
  'Ayesha Malik', 'Bilal Ahmed', 'Chen Wei', 'Daniel Okafor', 'Elena Petrova', 'Farah Siddiqui',
  'Gabriel Costa', 'Hina Raza', 'Ibrahim Yusuf', 'Julia Novak', 'Kamal Haddad', 'Laila Hassan',
  'Marco Rossi', 'Nadia Karim', 'Omar Sheikh', 'Priya Nair', 'Qasim Ali', 'Rana Aziz',
  'Sara Lindqvist', 'Tariq Mahmood', 'Usman Javed'
];
// Reviewed ratings for the first candidates; the rest stay at earlier stages.
const RATINGS = [5, 4.5, 4.5, 4, 4, 3.5, 3.5, 3, 2.5];

async function candidate(i, name) {
  const [firstName, lastName] = name.split(' ');
  const email = `candidate.${String(i + 1).padStart(2, '0')}@demo.pathment.com`;
  const existing = await models.User.findOne({ where: { email } });
  if (existing) return existing;
  const user = await models.User.create({
    firstName, lastName, email,
    passwordHash: await bcrypt.hash(PASSWORD, 12),
    role: 'mentee', status: 'active', emailVerified: true, emailVerifiedAt: new Date(),
    profileCompleted: true, onboardingStep: 3,
    // The app asks every member for a photo before anything else; demo
    // candidates arrive with one so they land on their qualification work.
    profilePictureUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`
  });
  await models.MenteeProfile.create({ userId: user.id });
  return user;
}

async function seedPool() {
  const poolService = require('../src/services/poolService');
  const submissionService = require('../src/services/submissionService');
  const quizSessionService = require('../src/services/quizSessionService');

  const admin = await models.User.findOne({ where: { email: 'admin@demo.pathment.com' } });
  const program = await models.Program.findOne({ where: { name: 'MERN Stack Engineering Fellowship (Demo)' } });
  const quiz = await models.QuizKit.findOne({ where: { status: 'published' } });
  if (!admin || !program) throw new Error('Run `npm run seed:demo` first');

  const old = await models.CandidatePool.findAll({ where: { name: POOL_NAME } });
  for (const pool of old) {
    const members = await models.PoolMember.findAll({ where: { poolId: pool.id }, attributes: ['id'] });
    await models.AssignedTask.destroy({ where: { poolMemberId: members.map((m) => m.id) } });
    await pool.destroy();
  }

  const created = await poolService.create({
    programId: program.id,
    name: POOL_NAME,
    description: 'Shortlisting the next MERN fellowship: a short quiz and one real project.',
    capacity: 300,
    selectionQuota: 6,
    qualificationDueAt: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    components: [{ label: 'Special assignment', weight: 70 }, { label: 'Quiz', weight: 30 }]
  }, admin);
  await poolService.setStatus(created.id, 'qualifying', admin);

  const users = [];
  for (const [i, name] of NAMES.entries()) users.push(await candidate(i, name));
  const invited = ['late.applicant1@example.com', 'late.applicant2@example.com', 'late.applicant3@example.com'];
  await poolService.importMembers(created.id, { emails: [...users.map((u) => u.email), ...invited] }, admin);

  await poolService.assignWork(created.id, {
    componentKey: 'special_assignment', type: 'project', title: 'Build a task-tracker REST API',
    description: 'Express + MongoDB. CRUD for tasks, input validation, and at least five tests.',
    acceptanceCriteria: ['Endpoints for create, list, update and delete', 'Validation with clear errors', 'Five or more passing tests', 'README with setup steps'],
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  }, admin);
  if (quiz) {
    await poolService.assignWork(created.id, { componentKey: 'quiz', type: 'quiz', quiz: { kitId: quiz.id, evaluationMode: 'auto' } }, admin);
  }

  const questions = quiz ? await models.QuizQuestion.findAll({ where: { kitId: quiz.id }, order: [['position', 'ASC']] }) : [];
  const projectOf = (user) => models.AssignedTask.findOne({
    where: { menteeId: user.id, isCustomTask: true, status: 'assigned' },
    include: [{ model: models.RoadmapTask, as: 'roadmapTask', where: { type: 'project' } }]
  });
  const quizOf = (user) => models.AssignedTask.findOne({
    where: { menteeId: user.id, status: 'assigned' },
    include: [{ model: models.RoadmapTask, as: 'roadmapTask', where: { type: 'quiz' } }]
  });
  const submit = async (task, user) => {
    const out = await submissionService.submitTaskWithFiles(task.id, user.id, {
      submissionText: `Repo and notes from ${user.firstName}.`,
      submissionUrls: [`https://github.com/demo/${user.firstName.toLowerCase()}-task-api`]
    }, []);
    return out.id;
  };
  const review = (submissionId, rating, approve = true) => submissionService.reviewSubmission(submissionId, admin.id, {
    decision: approve ? 'approved' : 'changes', isApproved: approve, rating,
    feedbackText: approve ? 'Clear structure and good tests.' : 'Add validation errors and a README.',
    revisionNotes: approve ? null : 'Add validation errors and a README.'
  });

  for (const [i, user] of users.entries()) {
    const project = await projectOf(user);
    if (i < RATINGS.length) {
      await review(await submit(project, user), RATINGS[i]);
      // The quiz goes through the quiz itself and is auto-graded on submit.
      const q = quiz && await quizOf(user);
      if (q) {
        const session = await quizSessionService.startOrResume(q.id, user.id);
        const sessionId = session.id ?? session.session?.id;
        // Stronger candidates get more of the answer key right.
        const share = RATINGS[i] / 5;
        for (const [n, question] of questions.entries()) {
          if (n / questions.length < share && question.correctOptionIds?.length) {
            await quizSessionService.saveAnswer(sessionId, user.id, question.id, { selectedOptionIds: question.correctOptionIds });
          }
        }
        await quizSessionService.submit(sessionId, user.id);
      }
    } else if (i < 14) {
      await submit(project, user); // waiting for review
    } else if (i < 16) {
      await review(await submit(project, user), 2, false); // changes requested
    } else if (i < 19) {
      await project.update({ status: 'in_progress', startedAt: new Date() });
    }
  }

  console.log(`✅ ${POOL_NAME}: ${users.length} candidates + ${invited.length} pending invites`);
  console.log('   Admin: admin@demo.pathment.com  ·  Candidate: candidate.01@demo.pathment.com  ·  Password: Demo@1234');
}

/** The workspace `seed:demo` built, found through its admin. Nothing here creates or clears one. */
async function main() {
  await sequelize.authenticate();
  const admin = await models.User.findOne({ where: { email: 'admin@demo.pathment.com' }, attributes: ['id'] });
  const membership = admin && await models.OrganizationMembership.findOne({
    where: { userId: admin.id },
    include: [{ model: models.Organization, as: 'organization', attributes: ['id', 'slug'] }]
  });
  if (!membership?.organization) throw new Error('Run `npm run seed:demo` first');
  const { id, slug } = membership.organization;
  await runWithRequestContext({ organizationId: id, organizationSlug: slug, userId: admin.id }, seedPool);
}

main()
  .catch((error) => { console.error('Pool demo seed failed:', error.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
