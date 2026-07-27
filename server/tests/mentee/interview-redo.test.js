'use strict';

/**
 * Mentor-requested partial redo: the mentor sends specific questions back, the
 * mentee re-answers ONLY those in the same session (in place), then re-submits.
 * Independent of the full-retake setting; other answers are untouched.
 */

const { models } = require('../../src/db');
const svc = require('../../src/services/interviewSessionService');
const { cleanDb, createMentor, createMentee } = require('../helpers/seed');

describe('interview partial redo', () => {
  let mentor, mentee, task, kit, q1, q2, session, submission;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    const rt = await models.RoadmapTask.create(
      { title: 'Frontend Interview', description: 'x', type: 'interview', difficulty: 'medium', taskOrder: 1, deliverable: 'x' },
      { validate: false }
    );
    task = await models.AssignedTask.create(
      { menteeId: mentee.id, mentorId: mentor.id, roadmapTaskId: rt.id, status: 'submitted' },
      { validate: false }
    );
    kit = await models.InterviewKit.create({ title: 'FE', createdBy: mentor.id });
    q1 = await models.InterviewQuestion.create({ kitId: kit.id, position: 0, kind: 'voice', prompt: 'Q1', points: 5 });
    q2 = await models.InterviewQuestion.create({ kitId: kit.id, position: 1, kind: 'voice', prompt: 'Q2', points: 5 });
    // allowRetake FALSE on purpose — redo must still work.
    const assignment = await models.InterviewAssignment.create({ assignedTaskId: task.id, kitId: kit.id, allowRetake: false });
    submission = await models.TaskSubmission.create({ assignedTaskId: task.id, version: 1, submissionText: 'Interview completed — 2 answers (attempt 1).', status: 'pending' });
    session = await models.InterviewSession.create({
      assignedTaskId: task.id, interviewAssignmentId: assignment.id, menteeId: mentee.id,
      attemptNumber: 1, status: 'submitted', startedAt: new Date(), submittedAt: new Date(),
      meta: { submissionId: submission.id },
    });
    await models.InterviewAnswer.create({ sessionId: session.id, questionId: q1.id, position: 0, kind: 'voice', pointsPossible: 5, transcript: 'good answer one' });
    await models.InterviewAnswer.create({ sessionId: session.id, questionId: q2.id, position: 1, kind: 'voice', pointsPossible: 5, transcript: null }); // missing
  });

  it('runs the full redo cycle and leaves other answers untouched', async () => {
    // Mentor sends back only Q2.
    const out = await svc.requestRedo(task.id, mentor.id, { questionIds: [q2.id], note: 'Q2 had no audio' });
    expect(out.count).toBe(1);
    await session.reload();
    expect((session.meta.redoQuestionIds || []).map(String)).toEqual([String(q2.id)]);
    await task.reload();
    expect(task.status).toBe('revision_needed');

    // Mentee sees a redo pending and can start despite allowRetake=false.
    const cand = await svc.getForCandidate(task.id, mentee.id);
    expect(cand.state.canStart).toBe(true);
    expect((cand.state.redoQuestionIds || []).map(String)).toEqual([String(q2.id)]);

    // Starting re-opens the SAME submitted session (same id), not a new attempt.
    const started = await svc.startOrResume(task.id, mentee.id);
    expect(started.id).toBe(session.id);
    expect(await models.InterviewSession.count({ where: { assignedTaskId: task.id } })).toBe(1);

    // Only the flagged question may be re-answered.
    await svc.saveAnswer(session.id, mentee.id, q2.id, { transcript: 'my re-recorded answer' });
    await expect(svc.saveAnswer(session.id, mentee.id, q1.id, { transcript: 'sneaky edit' })).rejects.toThrow(/redo/i);

    // Q1 (not flagged) is untouched; Q2 now has the new answer.
    const a1 = await models.InterviewAnswer.findOne({ where: { sessionId: session.id, questionId: q1.id } });
    const a2 = await models.InterviewAnswer.findOne({ where: { sessionId: session.id, questionId: q2.id } });
    expect(a1.transcript).toBe('good answer one');
    expect(a2.transcript).toBe('my re-recorded answer');

    // Re-submit: redo flags cleared, a fresh submission version lands for review.
    await svc.submit(session.id, mentee.id);
    await session.reload();
    expect(session.status).toBe('submitted');
    expect(session.meta.redoQuestionIds).toEqual([]);
    const latest = await models.TaskSubmission.findOne({ where: { assignedTaskId: task.id }, order: [['version', 'DESC']] });
    expect(latest.version).toBe(2);
    expect(latest.submissionText).toMatch(/redo/i);
    await task.reload();
    expect(task.status).toBe('submitted');
  });

  it('rejects an empty selection', async () => {
    await expect(svc.requestRedo(task.id, mentor.id, { questionIds: [] })).rejects.toThrow(/at least one/i);
  });
});
