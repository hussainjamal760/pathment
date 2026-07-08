'use strict';

/**
 * Spot-check for the quiz-module bug fixes (Bugs 2/3/4). Drives the REAL
 * quizSessionService through a live test DB: mentee submits → auto-grade with
 * partial credit → mentor overrides a per-question score (must clamp) → finalize
 * (must sync the mentee-facing submission line + round the percentage).
 */

const { models } = require('../../src/db');
const quizSessionService = require('../../src/services/quizSessionService');
const {
  cleanDb,
  createMentor,
  createMentee,
} = require('../helpers/seed');

describe('Quiz module fixes (Bugs 2/3/4)', () => {
  let mentor, mentee, task, kit, q1, q2, q3, q4, session;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    // Minimal quiz custom task — the grading path only needs menteeId/mentorId.
    // Skip model validators (roadmapTaskId/enrollmentId are nullable at the DB level).
    task = await models.AssignedTask.create(
      { menteeId: mentee.id, mentorId: mentor.id, status: 'in_progress' },
      { validate: false }
    );

    kit = await models.QuizKit.create({ title: 'React fundamentals', createdBy: mentor.id });
    q1 = await models.QuizQuestion.create({ kitId: kit.id, position: 0, kind: 'single', prompt: 'Which hook manages state?', points: 5, options: [{ id: 'a', label: 'useState' }, { id: 'b', label: 'useRef' }], correctOptionIds: ['a'] });
    q2 = await models.QuizQuestion.create({ kitId: kit.id, position: 1, kind: 'multi', prompt: 'Which are React hooks?', points: 5, options: [{ id: 'x', label: 'useEffect' }, { id: 'y', label: 'useMemo' }, { id: 'z', label: 'useThing' }], correctOptionIds: ['x', 'y'] });
    q3 = await models.QuizQuestion.create({ kitId: kit.id, position: 2, kind: 'boolean', prompt: 'JSX is required.', points: 2, options: [{ id: 't', label: 'True' }, { id: 'f', label: 'False' }], correctOptionIds: ['f'] });
    q4 = await models.QuizQuestion.create({ kitId: kit.id, position: 3, kind: 'short', prompt: 'CLI to bootstrap Vite?', points: 3, acceptedAnswers: ['create vite'], matchMode: 'exact' });

    const assignment = await models.QuizAssignment.create({ assignedTaskId: task.id, kitId: kit.id, evaluationMode: 'review', allowRetake: false });
    session = await models.QuizSession.create({ assignedTaskId: task.id, quizAssignmentId: assignment.id, menteeId: mentee.id, attemptNumber: 1, status: 'in_progress', startedAt: new Date() });
    // Answers: Q1 correct; Q2 one right pick only ([x]) → partial; Q3 wrong; Q4 wrong.
    await quizSessionService.saveAnswer(session.id, mentee.id, q1.id, { selectedOptionIds: ['a'] });
    await quizSessionService.saveAnswer(session.id, mentee.id, q2.id, { selectedOptionIds: ['x'] });
    await quizSessionService.saveAnswer(session.id, mentee.id, q3.id, { selectedOptionIds: ['t'] });
    await quizSessionService.saveAnswer(session.id, mentee.id, q4.id, { answerText: 'no idea' });
  });

  it('Bug 2: multi-select earns partial credit on submit', async () => {
    const res = await quizSessionService.submit(session.id, mentee.id);
    // Q1=5, Q2 (1 of 2 right, 0 wrong) = round(5*0.5)=3, Q3=0, Q4=0 → 8/15 = 53%.
    expect(res.autoScore).toBe(8);
    expect(res.maxScore).toBe(15);
    const a2 = await models.QuizAnswer.findOne({ where: { sessionId: session.id, questionId: q2.id } });
    expect(a2.pointsAwarded).toBe(3);
    expect(a2.isCorrect).toBe(false); // partial, not fully correct
    const sub = await models.TaskSubmission.findOne({ where: { assignedTaskId: task.id }, order: [['version', 'DESC']] });
    expect(sub.submissionText).toBe('Quiz completed — 8/15 points (53%).');
  });

  it('Bug 4: mentor per-question override clamps to the question max', async () => {
    await quizSessionService.submit(session.id, mentee.id);
    const out = await quizSessionService.gradeAnswer(task.id, mentor.id, q3.id, { pointsAwarded: 100 });
    expect(out.pointsAwarded).toBe(2); // clamped to q3.points (2), NOT 100
    const a3 = await models.QuizAnswer.findOne({ where: { sessionId: session.id, questionId: q3.id } });
    expect(a3.pointsAwarded).toBe(2);
  });

  it('Bug 3+4: finalize rounds the percent and syncs the mentee submission line', async () => {
    await quizSessionService.submit(session.id, mentee.id);
    await quizSessionService.gradeAnswer(task.id, mentor.id, q3.id, { pointsAwarded: 100 }); // → clamped 2
    const fin = await quizSessionService.finalizeReview(task.id, mentor.id, {});
    // Q1 5 + Q2 3 + Q3 2 + Q4 0 = 10/15 = 66.66% → rounds to 67.
    expect(fin.totalAwarded).toBe(10);
    expect(fin.totalPossible).toBe(15);
    expect(fin.pointsPercent).toBe(67); // rounded, not 66.666…
    // The mentee-facing submission line is rewritten to the final reviewed score
    // (was the stale "Quiz completed — 8/15 (53%)").
    const sub = await models.TaskSubmission.findOne({ where: { assignedTaskId: task.id }, order: [['version', 'DESC']] });
    expect(sub.submissionText).toBe('Quiz reviewed — 10/15 points (67%).');
    // Score→stars kept per product decision: derived from the raw % (66.667/100*5) = 3.33.
    const fb = await models.TaskFeedback.findOne({ where: {}, order: [['created_at', 'DESC']] });
    expect(Number(fb.rating)).toBeCloseTo(3.33, 2);
  });
});
