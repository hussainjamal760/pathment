'use strict';

/**
 * Batch "AI grade all" + per-question snapshot bucketing.
 *
 * - aiDraftAll: transcribes voice answers with Whisper (stubbed), grades every
 *   question in one pass, and scales each suggestion to THAT question's points.
 * - getForReview: buckets each proctor snapshot to the question that was on
 *   screen when it was taken (explicit questionId wins; else by timestamp).
 */

// Stub the AI provider — aiDraftAll require()s it lazily inside the method.
jest.mock('../../src/services/groqService', () => ({
  transcribeAudio: jest.fn(async () => 'clean whisper transcript'),
  // Grade every question in the prompt at 80/100 by pulling the ids back out.
  generateText: jest.fn(async ({ prompt }) => {
    const ids = [...prompt.matchAll(/id: (\S+) · worth/g)].map((m) => m[1]);
    return JSON.stringify(ids.map((id) => ({ id, score: 80, note: 'auto' })));
  }),
}));

const { models } = require('../../src/db');
const groqService = require('../../src/services/groqService');
const svc = require('../../src/services/interviewSessionService');
const { cleanDb, createMentor, createMentee } = require('../helpers/seed');

describe('interview AI grade-all + snapshot bucketing', () => {
  let mentor, mentee, task, kit, q1, q2, q3, assignment, session;

  beforeEach(async () => {
    await cleanDb();
    groqService.transcribeAudio.mockClear();
    groqService.generateText.mockClear();
    mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    const rt = await models.RoadmapTask.create(
      { title: 'FE Interview', description: 'x', type: 'interview', difficulty: 'medium', taskOrder: 1, deliverable: 'x' },
      { validate: false }
    );
    task = await models.AssignedTask.create(
      { menteeId: mentee.id, mentorId: mentor.id, roadmapTaskId: rt.id, status: 'submitted' },
      { validate: false }
    );
    kit = await models.InterviewKit.create({ title: 'FE', createdBy: mentor.id });
    q1 = await models.InterviewQuestion.create({ kitId: kit.id, position: 0, kind: 'voice', prompt: 'Voice Q', points: 5, referenceAnswer: 'ref' });
    q2 = await models.InterviewQuestion.create({ kitId: kit.id, position: 1, kind: 'text', prompt: 'Text Q', points: 10 });
    q3 = await models.InterviewQuestion.create({ kitId: kit.id, position: 2, kind: 'code', prompt: 'Code Q', points: 5, codeLanguage: 'javascript' });
    assignment = await models.InterviewAssignment.create({ assignedTaskId: task.id, kitId: kit.id, allowRetake: false });

    const t0 = new Date('2026-01-01T10:00:00Z');
    const t1 = new Date('2026-01-01T10:02:00Z');
    const t2 = new Date('2026-01-01T10:04:00Z');
    session = await models.InterviewSession.create({
      assignedTaskId: task.id, interviewAssignmentId: assignment.id, menteeId: mentee.id,
      attemptNumber: 1, status: 'submitted', startedAt: t0, submittedAt: t2,
      proctorLog: [
        { type: 'snapshot', at: new Date('2026-01-01T10:00:30Z').toISOString(), meta: { url: 's0', publicId: 'p0' } }, // → q1 (by time)
        { type: 'snapshot', at: new Date('2026-01-01T10:02:30Z').toISOString(), meta: { url: 's1', publicId: 'p1' } }, // → q2 (by time)
        { type: 'snapshot', at: new Date('2026-01-01T10:00:10Z').toISOString(), meta: { url: 's2', publicId: 'p2', questionId: String(q3.id) } }, // → q3 (explicit)
        { type: 'focus_loss', at: t1.toISOString(), meta: {} },
      ],
    });
    await models.InterviewAnswer.create({ sessionId: session.id, questionId: q1.id, position: 0, kind: 'voice', pointsPossible: 5, startedAt: t0, audioUrl: 'https://cloud/a.webm', transcript: 'garbled live text' });
    await models.InterviewAnswer.create({ sessionId: session.id, questionId: q2.id, position: 1, kind: 'text', pointsPossible: 10, startedAt: t1, answerText: 'typed answer' });
    await models.InterviewAnswer.create({ sessionId: session.id, questionId: q3.id, position: 2, kind: 'code', pointsPossible: 5, startedAt: t2, code: 'const x = 1;' });
  });

  it('grades every question in one pass, scaled to each question’s points', async () => {
    const out = await svc.aiDraftAll(task.id, mentor.id);
    expect(out.graded).toBe(3);

    const byQ = new Map(out.drafts.map((d) => [String(d.questionId), d]));
    // 80% of each question's points: 5→4, 10→8, 5→4.
    expect(byQ.get(String(q1.id)).suggestedPoints).toBe(4);
    expect(byQ.get(String(q2.id)).suggestedPoints).toBe(8);
    expect(byQ.get(String(q3.id)).suggestedPoints).toBe(4);

    // One chunk → one grading call; Whisper only on the voice answer with audio.
    expect(groqService.generateText).toHaveBeenCalledTimes(1);
    expect(groqService.transcribeAudio).toHaveBeenCalledTimes(1);

    // The Whisper transcript is cached on the voice answer's aiDraft.
    const a1 = await models.InterviewAnswer.findOne({ where: { sessionId: session.id, questionId: q1.id } });
    expect(a1.aiDraft.transcript).toBe('clean whisper transcript');
    expect(a1.aiDraft.suggestedPoints).toBe(4);
  });

  it('grades only the requested slice (client chunking)', async () => {
    // The client pages through in chunks — a call with questionIds must touch
    // ONLY those questions, so a long interview never times out in one request.
    const out = await svc.aiDraftAll(task.id, mentor.id, { questionIds: [q2.id] });
    expect(out.graded).toBe(1);
    expect(out.drafts.map((d) => String(d.questionId))).toEqual([String(q2.id)]);
    // Untouched questions have no draft yet.
    const a1 = await models.InterviewAnswer.findOne({ where: { sessionId: session.id, questionId: q1.id } });
    expect(a1.aiDraft).toBeFalsy();
    // A voice answer wasn't in the slice → no Whisper call.
    expect(groqService.transcribeAudio).not.toHaveBeenCalled();
  });

  it('reuses a cached Whisper transcript instead of re-transcribing', async () => {
    await svc.aiDraftAll(task.id, mentor.id);
    expect(groqService.transcribeAudio).toHaveBeenCalledTimes(1);
    // Second run: transcript already on aiDraft → no new Whisper call.
    await svc.aiDraftAll(task.id, mentor.id);
    expect(groqService.transcribeAudio).toHaveBeenCalledTimes(1);
  });

  it('buckets each snapshot to the question that was on screen', async () => {
    const review = await svc.getForReview(task.id, mentor.id);
    const snapsFor = (qid) => review.items.find((it) => String(it.questionId) === String(qid)).snapshots.map((s) => s.url);
    expect(snapsFor(q1.id)).toEqual(['s0']); // by timestamp
    expect(snapsFor(q2.id)).toEqual(['s1']); // by timestamp
    expect(snapsFor(q3.id)).toEqual(['s2']); // explicit questionId wins over its early timestamp
  });
});
