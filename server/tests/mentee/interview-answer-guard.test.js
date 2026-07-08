'use strict';

/**
 * Guards the interview data-loss fix: a per-question autosave must never wipe a
 * previously saved answer with a stray empty/null value (the client race that
 * lost typed answers), while a real edit still updates.
 */

const { models } = require('../../src/db');
const interviewSessionService = require('../../src/services/interviewSessionService');
const { cleanDb, createMentor, createMentee } = require('../helpers/seed');

describe('interview saveAnswer null-clobber guard', () => {
  let mentee, kit, question, session;

  beforeEach(async () => {
    await cleanDb();
    const mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    const task = await models.AssignedTask.create(
      { menteeId: mentee.id, mentorId: mentor.id, status: 'in_progress' },
      { validate: false }
    );
    kit = await models.InterviewKit.create({ title: 'Frontend screen', createdBy: mentor.id });
    question = await models.InterviewQuestion.create({ kitId: kit.id, position: 0, kind: 'voice', prompt: 'Tell me about closures.', points: 10 });
    const assignment = await models.InterviewAssignment.create({ assignedTaskId: task.id, kitId: kit.id });
    session = await models.InterviewSession.create({ assignedTaskId: task.id, interviewAssignmentId: assignment.id, menteeId: mentee.id, attemptNumber: 1, status: 'in_progress', startedAt: new Date() });
  });

  const stored = async () => (await models.InterviewAnswer.findOne({ where: { sessionId: session.id, questionId: question.id } }))?.transcript;

  it('keeps a saved transcript when a later empty autosave arrives', async () => {
    await interviewSessionService.saveAnswer(session.id, mentee.id, question.id, { transcript: 'my real answer', code: null, answerText: null });
    expect(await stored()).toBe('my real answer');

    // The stray empty flush (stale closure / race) must NOT wipe it.
    await interviewSessionService.saveAnswer(session.id, mentee.id, question.id, { transcript: null, code: null, answerText: null });
    expect(await stored()).toBe('my real answer');

    await interviewSessionService.saveAnswer(session.id, mentee.id, question.id, { transcript: '', code: null, answerText: null });
    expect(await stored()).toBe('my real answer');
  });

  it('still applies a genuine edit over the old value', async () => {
    await interviewSessionService.saveAnswer(session.id, mentee.id, question.id, { transcript: 'first', code: null, answerText: null });
    await interviewSessionService.saveAnswer(session.id, mentee.id, question.id, { transcript: 'edited answer', code: null, answerText: null });
    expect(await stored()).toBe('edited answer');
  });
});
