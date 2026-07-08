const { models, sequelize } = require('../db');
const { Op } = require('sequelize');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const authzService = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');

/**
 * InterviewSessionService — the candidate runner (Phase 2). Owns starting/resuming
 * an attempt, autosaving per-question answers (transcript / code / text), attaching
 * recorded audio, logging proctor events, and submitting the finished interview
 * (which drops a TaskSubmission marker so it lands in the mentor's Approvals queue).
 */
class InterviewSessionService {
  /** Load the assignment + kit for a task, asserting the mentee owns it. */
  async _loadContext(taskId, menteeId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    if (task.menteeId !== menteeId) throw new ForbiddenError('This interview is not assigned to you');

    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const kit = await models.InterviewKit.findByPk(assignment.kitId, {
      include: [{ model: models.InterviewQuestion, as: 'questions' }],
    });
    if (!kit) throw new NotFoundError('Interview kit not found');

    const questions = [...(kit.questions || [])].sort((a, b) => a.position - b.position);
    return { task, assignment, kit, questions };
  }

  /** Public candidate shape of a question — NEVER leaks the reference answer. */
  _publicQuestion(q) {
    return {
      id: q.id,
      position: q.position,
      kind: q.kind,
      prompt: q.prompt,
      timeLimitSeconds: q.timeLimitSeconds,
      points: q.points,
      required: q.required,
      codeLanguage: q.codeLanguage,
      starterCode: q.starterCode,
      // Mentor's own recording for this question (plays instead of TTS if present).
      promptAudioUrl: (q.config && q.config.promptAudioUrl) || null,
    };
  }

  /**
   * The candidate's view: kit meta + public questions + options + current attempt
   * state (whether they can start, resume an in-progress attempt, or are done).
   */
  async getForCandidate(taskId, menteeId) {
    const { task, assignment, kit, questions } = await this._loadContext(taskId, menteeId);

    // Interviewer identity: the mentor's kit config, defaulting the NAME to the
    // kit creator's own name (so it's "Meet <mentor>", not a generic persona).
    const ivSettings = (kit.settings && kit.settings.interviewer) || {};
    let defaultName = null;
    if (!ivSettings.name) {
      const creator = await models.User.findByPk(kit.createdBy, { attributes: ['firstName', 'lastName'] });
      if (creator) defaultName = creator.firstName || `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || null;
    }
    const interviewer = {
      name: ivSettings.name || defaultName || 'Aria',
      voiceName: ivSettings.voiceName || null,
      pitch: typeof ivSettings.pitch === 'number' ? ivSettings.pitch : 1,
      rate: typeof ivSettings.rate === 'number' ? ivSettings.rate : 1,
    };

    const sessions = await models.InterviewSession.findAll({
      where: { assignedTaskId: taskId, menteeId },
      order: [['attempt_number', 'DESC']],
    });
    const active = sessions.find((s) => s.status === 'in_progress') || null;
    const submittedCount = sessions.filter((s) => s.status === 'submitted').length;

    // Can they take it? Fresh if no attempts; resumable if one's in progress;
    // otherwise only when retake is allowed.
    const canStart = !active && (submittedCount === 0 || assignment.allowRetake);

    let answers = [];
    if (active) {
      const rows = await models.InterviewAnswer.findAll({ where: { sessionId: active.id } });
      answers = rows.map((a) => ({
        questionId: a.questionId,
        transcript: a.transcript,
        audioUrl: a.audioUrl,
        code: a.code,
        answerText: a.answerText,
        timeSpentSeconds: a.timeSpentSeconds,
        startedAt: a.startedAt, // wall-clock anchor for resuming this question's timer
      }));
    }

    return {
      task: { id: task.id, status: task.status, dueDate: task.dueDate },
      kit: {
        id: kit.id,
        title: kit.title,
        description: kit.description,
        totalPoints: questions.reduce((s, q) => s + (q.points || 0), 0),
      },
      // Interviewer identity/voice for the candidate's TTS (name defaults to the
      // kit creator's name; pitch/rate/voice from the mentor's config).
      interviewer,
      options: {
        allowRetake: assignment.allowRetake,
        cameraRequired: assignment.cameraRequired,
        timingMode: assignment.timingMode,
        totalSeconds: assignment.totalSeconds,
      },
      questions: questions.map((q) => this._publicQuestion(q)),
      state: {
        canStart,
        activeSessionId: active ? active.id : null,
        attemptNumber: active ? active.attemptNumber : submittedCount + 1,
        submittedCount,
        savedAnswers: answers,
        // Resume metadata: where they were, and when the (total-mode) session began.
        currentPosition: active ? (active.currentPosition || 0) : 0,
        sessionStartedAt: active ? active.startedAt : null,
      },
      // Server clock so the client can correct for local clock skew when computing
      // remaining time (all deadlines are wall-clock, server-authoritative).
      serverNow: new Date().toISOString(),
    };
  }

  /**
   * Stamp when the candidate first started a question (idempotent) and remember it
   * as the session's current position. The wall-clock deadline is this timestamp +
   * the question's limit, so a refresh/resume continues the real countdown instead
   * of restarting it. Returns the authoritative start + the server clock (for skew).
   */
  async startQuestion(sessionId, menteeId, questionId) {
    const session = await this._openSession(sessionId, menteeId);
    if (!questionId) throw new ValidationError('questionId is required');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question || question.kitId !== (await this._kitIdForSession(session))) {
      throw new ValidationError('That question is not part of this interview');
    }

    const [answer] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId, questionId },
      defaults: {
        sessionId, questionId,
        position: question.position,
        kind: question.kind,
        promptSnapshot: question.prompt,
        pointsPossible: question.points,
        codeLanguage: question.kind === 'code' ? question.codeLanguage : null,
        startedAt: new Date(),
      },
    });
    // Only stamp the start once — resuming must NOT reset the clock.
    if (!answer.startedAt) await answer.update({ startedAt: new Date() });
    // Advance the resume position forward-only (you can't go back to a question).
    if (question.position > (session.currentPosition || 0)) {
      await session.update({ currentPosition: question.position });
    }
    return { startedAt: answer.startedAt, serverNow: new Date().toISOString() };
  }

  /** Start a fresh attempt or resume the in-progress one. Enforces retake rules. */
  async startOrResume(taskId, menteeId) {
    const { assignment } = await this._loadContext(taskId, menteeId);

    const existing = await models.InterviewSession.findOne({
      where: { assignedTaskId: taskId, menteeId, status: 'in_progress' },
    });
    if (existing) return this._sessionShape(existing);

    const submittedCount = await models.InterviewSession.count({
      where: { assignedTaskId: taskId, menteeId, status: 'submitted' },
    });
    if (submittedCount > 0 && !assignment.allowRetake) {
      throw new ConflictError('You have already completed this interview.');
    }

    const session = await models.InterviewSession.create({
      assignedTaskId: taskId,
      interviewAssignmentId: assignment.id,
      menteeId,
      attemptNumber: submittedCount + 1,
      status: 'in_progress',
      startedAt: new Date(),
    });

    // Mark the task in-progress the first time they begin.
    await models.AssignedTask.update(
      { status: 'in_progress', startedAt: sequelize.literal('COALESCE(started_at, NOW())') },
      { where: { id: taskId, status: { [Op.in]: ['assigned', 'not_started'] } } }
    );

    return this._sessionShape(session);
  }

  _sessionShape(s) {
    return { id: s.id, attemptNumber: s.attemptNumber, status: s.status, startedAt: s.startedAt };
  }

  /** Assert the session belongs to this mentee and is still open. */
  async _openSession(sessionId, menteeId) {
    const session = await models.InterviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Interview session not found');
    if (session.menteeId !== menteeId) throw new ForbiddenError('This session is not yours');
    if (session.status !== 'in_progress') throw new ConflictError('This interview has already been submitted.');
    return session;
  }

  /** Assert ownership only (any status). Used for late-arriving background audio
   *  uploads that may land just after the candidate hit submit. */
  async _ownedSession(sessionId, menteeId) {
    const session = await models.InterviewSession.findByPk(sessionId);
    if (!session) throw new NotFoundError('Interview session not found');
    if (session.menteeId !== menteeId) throw new ForbiddenError('This session is not yours');
    return session;
  }

  /**
   * Upsert a single answer (autosave). Snapshots the question's prompt/kind/points
   * on first write so the candidate's record survives later kit edits.
   */
  async saveAnswer(sessionId, menteeId, questionId, payload = {}) {
    const session = await this._openSession(sessionId, menteeId);
    if (!questionId) throw new ValidationError('questionId is required');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question || question.kitId !== (await this._kitIdForSession(session))) {
      throw new ValidationError('That question is not part of this interview');
    }

    const fields = {
      position: question.position,
      kind: question.kind,
      promptSnapshot: question.prompt,
      pointsPossible: question.points,
      codeLanguage: question.kind === 'code' ? question.codeLanguage : null,
    };
    if (payload.transcript !== undefined) fields.transcript = payload.transcript ? String(payload.transcript) : null;
    if (payload.code !== undefined) fields.code = payload.code ? String(payload.code) : null;
    if (payload.answerText !== undefined) fields.answerText = payload.answerText ? String(payload.answerText) : null;
    if (payload.timeSpentSeconds !== undefined) {
      const n = Number.parseInt(payload.timeSpentSeconds, 10);
      if (Number.isFinite(n) && n >= 0) fields.timeSpentSeconds = n;
    }

    const [answer] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId, questionId },
      defaults: { sessionId, questionId, ...fields },
    });
    // Safety net: never let a stray empty autosave (a race, a stale flush) wipe a
    // previously saved answer. Interview answers are one-shot — a blank incoming
    // value over existing content is almost always noise, not intentional deletion.
    for (const f of ['transcript', 'code', 'answerText']) {
      if ((fields[f] === null || fields[f] === '') && answer[f]) delete fields[f];
    }
    // findOrCreate doesn't update an existing row — apply the patch.
    await answer.update(fields);
    return { saved: true, questionId };
  }

  async _kitIdForSession(session) {
    const assignment = await models.InterviewAssignment.findByPk(session.interviewAssignmentId, { attributes: ['kitId'] });
    return assignment ? assignment.kitId : null;
  }

  /** Upload a recorded audio clip for one question and store its URL. Accepts a
   *  just-submitted session too, so a background/retry upload isn't lost. */
  async attachAudio(sessionId, menteeId, questionId, file) {
    const session = await this._ownedSession(sessionId, menteeId);
    if (!questionId) throw new ValidationError('questionId is required');
    if (!file || !file.buffer) throw new ValidationError('No audio file received');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question) throw new ValidationError('That question is not part of this interview');
    // Audio only belongs to a voice question. A clip landing on a code/text question
    // is always a client misattribution (a stale/shared recorder ref) — reject it
    // rather than corrupt that question's row with someone else's recording.
    if (question.kind !== 'voice') throw new ValidationError('Audio can only be attached to a voice question');

    // Audio goes under Cloudinary's 'video' resource type (it handles audio there).
    // Log the real reason on failure — otherwise the client only sees a generic
    // "audio failed" and we can never tell config from network from size.
    let result;
    try {
      result = await uploadToCloudinary(file.buffer, 'pathment/interviews', 'video');
    } catch (err) {
      console.error('[interview] audio upload to Cloudinary failed:', {
        message: err?.message, httpCode: err?.http_code, bytes: file.buffer?.length,
      });
      throw new ValidationError('Audio upload failed. Please check your connection and try again.');
    }

    const fields = {
      position: question.position,
      kind: question.kind,
      promptSnapshot: question.prompt,
      pointsPossible: question.points,
      audioUrl: result.secure_url,
      audioPublicId: result.public_id,
    };
    const [answer] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId, questionId },
      defaults: { sessionId, questionId, ...fields },
    });
    await answer.update(fields);
    return { audioUrl: result.secure_url, questionId };
  }

  /** Append proctor events (focus-loss, fullscreen-exit, paste, snapshot refs). */
  async logProctorEvents(sessionId, menteeId, events = []) {
    const session = await this._openSession(sessionId, menteeId);
    if (!Array.isArray(events) || !events.length) return { logged: 0 };
    const clean = events
      .filter((e) => e && typeof e.type === 'string')
      .map((e) => ({ type: e.type, at: e.at || new Date().toISOString(), meta: e.meta || {} }));
    await session.update({ proctorLog: [...(session.proctorLog || []), ...clean] });
    return { logged: clean.length };
  }

  /**
   * Upload a webcam proctor snapshot and record it in the proctor log as a
   * `snapshot` event carrying its URL. Called on an interval (and on suspicious
   * events) while the camera is required, so the mentor can eyeball presence.
   */
  async attachSnapshot(sessionId, menteeId, file) {
    const session = await this._openSession(sessionId, menteeId);
    if (!file || !file.buffer) throw new ValidationError('No snapshot received');
    const result = await uploadToCloudinary(file.buffer, 'pathment/interviews/snapshots', 'image');
    const event = { type: 'snapshot', at: new Date().toISOString(), meta: { url: result.secure_url, publicId: result.public_id } };
    await session.update({ proctorLog: [...(session.proctorLog || []), event] });
    return { url: result.secure_url };
  }

  // ── Mentor review (Phase 4) — mentor is the source of truth ──────────────────

  /** Assert the reviewer can act on this task (lead / co-mentor / cover). */
  async _assertReviewer(mentorId, task) {
    if (!(await authzService.canActOnTask(mentorId, task, PERMISSIONS.TASK_REVIEW))) {
      throw new ForbiddenError('You do not have permission to review this interview');
    }
  }

  /**
   * The mentor's review payload for an interview task: kit questions WITH their
   * reference answers, the candidate's latest submitted attempt (transcript /
   * audio / code + per-answer grades), the proctor log split into snapshots +
   * flags, and totals. Read-access is also granted to the owning mentee (so they
   * can see "what he said"); reviewer power is required for anyone else.
   */
  async getForReview(taskId, requesterId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    const isOwnerMentee = task.menteeId === requesterId;
    if (!isOwnerMentee) await this._assertReviewer(requesterId, task);

    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const kit = await models.InterviewKit.findByPk(assignment.kitId, {
      include: [{ model: models.InterviewQuestion, as: 'questions' }],
    });
    const questions = [...((kit && kit.questions) || [])].sort((a, b) => a.position - b.position);

    // Latest submitted attempt (fall back to the most recent session).
    const sessions = await models.InterviewSession.findAll({
      where: { assignedTaskId: taskId },
      order: [['attempt_number', 'DESC']],
      include: [
        { model: models.InterviewAnswer, as: 'answers' },
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] },
      ],
    });
    const session = sessions.find((s) => s.status === 'submitted') || sessions[0] || null;
    const answers = session ? [...(session.answers || [])].sort((a, b) => a.position - b.position) : [];
    const answerByQ = new Map(answers.map((a) => [a.questionId, a]));

    const proctorLog = session ? (session.proctorLog || []) : [];
    const snapshots = proctorLog.filter((e) => e.type === 'snapshot').map((e) => ({ url: e.meta?.url, at: e.at }));
    const flags = proctorLog.filter((e) => e.type !== 'snapshot');
    const flagCounts = flags.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; }, {});

    const items = questions.map((q) => {
      const a = answerByQ.get(q.id);
      return {
        questionId: q.id,
        position: q.position,
        kind: q.kind,
        prompt: q.prompt,
        points: q.points,
        codeLanguage: q.codeLanguage,
        referenceAnswer: isOwnerMentee ? null : (q.referenceAnswer || null), // hidden from the mentee
        answer: a ? {
          transcript: a.transcript,
          audioUrl: a.audioUrl,
          code: a.code,
          answerText: a.answerText,
          timeSpentSeconds: a.timeSpentSeconds,
          pointsAwarded: a.pointsAwarded,
          scoreNote: a.scoreNote,
          aiDraft: isOwnerMentee ? null : (a.aiDraft || null),
        } : null,
      };
    });

    const totalPossible = questions.reduce((s, q) => s + (q.points || 0), 0);
    const totalAwarded = items.reduce((s, it) => s + (Number(it.answer?.pointsAwarded) || 0), 0);
    const gradedCount = items.filter((it) => it.answer && it.answer.pointsAwarded != null).length;

    return {
      task: { id: task.id, status: task.status, pointsAwarded: task.pointsAwarded, menteeId: task.menteeId },
      kit: { id: kit?.id, title: kit?.title, description: kit?.description },
      options: {
        aiGradingEnabled: assignment.aiGradingEnabled,
        allowRetake: assignment.allowRetake,
        cameraRequired: assignment.cameraRequired,
      },
      session: session ? {
        id: session.id,
        status: session.status,
        attemptNumber: session.attemptNumber,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
        mentee: session.mentee ? {
          id: session.mentee.id,
          name: `${session.mentee.firstName} ${session.mentee.lastName}`.trim(),
          avatarUrl: session.mentee.profilePictureUrl,
        } : null,
      } : null,
      // Proctoring (webcam snapshots + behavior flags) is reviewer-only — never
      // shown back to the candidate being proctored.
      proctor: isOwnerMentee ? { snapshots: [], flags: [], flagCounts: {} } : { snapshots, flags, flagCounts },
      // Mentor's manual follow-up flag (hidden from the owning mentee).
      flag: isOwnerMentee ? null : (session?.meta?.flag?.flagged ? session.meta.flag : null),
      items,
      totals: { totalPossible, totalAwarded, gradedCount, questionCount: questions.length },
      canReview: !isOwnerMentee && task.status !== 'completed',
    };
  }

  /** Save a per-answer grade (mentor). Creates the answer row if the mentee skipped it. */
  async gradeAnswer(taskId, mentorId, questionId, { pointsAwarded, scoreNote } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted interview to grade');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question) throw new ValidationError('Unknown question');

    const patch = {};
    if (pointsAwarded !== undefined) {
      const n = Number.parseInt(pointsAwarded, 10);
      patch.pointsAwarded = Number.isFinite(n) ? Math.max(0, Math.min(question.points, n)) : null;
    }
    if (scoreNote !== undefined) patch.scoreNote = scoreNote ? String(scoreNote) : null;

    const [answer] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId: session.id, questionId },
      defaults: {
        sessionId: session.id, questionId, position: question.position,
        kind: question.kind, promptSnapshot: question.prompt, pointsPossible: question.points, ...patch,
      },
    });
    await answer.update(patch);
    return { questionId, pointsAwarded: answer.pointsAwarded, scoreNote: answer.scoreNote };
  }

  /** Delete the proctor snapshot images only (mentor). Strips them from the log
   *  and best-effort removes the files from Cloudinary; behavior flags are kept. */
  async deleteSnapshots(taskId, mentorId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No interview session found');

    const log = session.proctorLog || [];
    const snapshots = log.filter((e) => e.type === 'snapshot');
    const kept = log.filter((e) => e.type !== 'snapshot');

    const { deleteFromCloudinary } = require('../utils/cloudinaryUpload');
    await Promise.all(snapshots.map(async (e) => {
      const pid = e.meta?.publicId;
      if (pid) { try { await deleteFromCloudinary(pid, 'image'); } catch (err) { console.error('[interview] snapshot delete failed:', err?.message); } }
    }));

    await session.update({ proctorLog: kept });
    return { deleted: snapshots.length };
  }

  /** Flag (or clear the flag on) an interview for follow-up (mentor). Stored on
   *  the session meta so it survives and is visible on the review. */
  async setFlag(taskId, mentorId, { flagged, reason } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No interview session found');

    const flag = flagged
      ? { flagged: true, reason: reason ? String(reason) : null, by: mentorId, at: new Date().toISOString() }
      : { flagged: false };
    await session.update({ meta: { ...(session.meta || {}), flag } });
    return flag;
  }

  async _latestSubmittedSession(taskId) {
    const sessions = await models.InterviewSession.findAll({
      where: { assignedTaskId: taskId },
      order: [['attempt_number', 'DESC']],
    });
    return sessions.find((s) => s.status === 'submitted') || sessions[0] || null;
  }

  /**
   * AI draft grade for one answer (optional assist, gated on the assignment's
   * aiGradingEnabled + a configured BYO key). Suggests a score + short note by
   * comparing the candidate's answer to the reference answer. Stored on the
   * answer; the mentor still decides.
   */
  async aiDraftAnswer(taskId, mentorId, questionId) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    // AI draft is mentor-initiated and runs on the mentor's OWN key, so it's
    // available whenever this is a real interview — not gated to the assign-time
    // toggle (that toggle only controls whether it's suggested up front).
    const assignment = await models.InterviewAssignment.findOne({ where: { assignedTaskId: taskId } });
    if (!assignment) throw new NotFoundError('This task is not an interview');

    const question = await models.InterviewQuestion.findByPk(questionId);
    if (!question) throw new ValidationError('Unknown question');
    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted interview to grade');
    const answer = await models.InterviewAnswer.findOne({ where: { sessionId: session.id, questionId } });

    const groqService = require('./groqService');

    // For a voice answer, re-transcribe the actual recording with Whisper — the
    // browser's live STT frequently garbles accent/pronunciation, and grading that
    // garbled text is unfair. Fall back to the browser transcript if unavailable.
    let aiTranscript = null;
    if (question.kind === 'voice' && answer?.audioUrl) {
      try {
        aiTranscript = await groqService.transcribeAudio({ audioUrl: answer.audioUrl, userId: mentorId, feature: 'feedback' });
      } catch (e) {
        console.error('[interview] Whisper transcription failed:', e.message);
      }
    }

    const spoken = aiTranscript || answer?.transcript;
    const candidate = [spoken, answer?.answerText, answer?.code].filter(Boolean).join('\n\n') || '(no answer given)';
    const raw = await groqService.generateText({
      feature: 'feedback',
      userId: mentorId,
      temperature: 0.2,
      maxTokens: 280,
      system: [
        'You are a fair, experienced technical interviewer grading ONE answer.',
        'Use the reference rubric — which may describe "at bar", "above bar", and "red flag" levels — to score the candidate from 0 to 100 on correctness and clarity.',
        'The answer may be an automatic voice transcription, so overlook spelling, grammar and transcription noise — judge the underlying understanding, not the wording.',
        'Reply with STRICT JSON only: {"score": <integer 0-100>, "note": "<one or two sentences: what was right and what was missing>"}. No text outside the JSON.',
      ].join(' '),
      prompt: `Question:\n${question.prompt}\n\nReference answer / rubric:\n${question.referenceAnswer || '(none provided — judge on correctness and clarity)'}\n\nCandidate answer:\n${candidate}`,
    });

    let parsed = { score: null, note: raw };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch { /* keep raw as note */ }

    const pct = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    const suggestedPoints = Math.round((pct / 100) * question.points);
    const aiDraft = { score: pct, suggestedPoints, note: parsed.note || raw, transcript: aiTranscript || null, at: new Date().toISOString() };

    const [row] = await models.InterviewAnswer.findOrCreate({
      where: { sessionId: session.id, questionId },
      defaults: {
        sessionId: session.id, questionId, position: question.position,
        kind: question.kind, promptSnapshot: question.prompt, pointsPossible: question.points, aiDraft,
      },
    });
    await row.update({ aiDraft });
    return aiDraft;
  }

  /**
   * Finalize the review: sum the per-answer scores and complete the task through
   * the shared review path (so points, gamification, the mentee notification and
   * the Approvals "reviewed" tab all behave exactly like a normal submission). The
   * interview score is applied as a percentage of the task's standard points, so it
   * fits the difficulty-based points economy.
   */
  async finalizeReview(taskId, mentorId, { overallNote } = {}) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    await this._assertReviewer(mentorId, task);

    const session = await this._latestSubmittedSession(taskId);
    if (!session) throw new NotFoundError('No submitted interview to review');
    const submissionId = session.meta?.submissionId;
    if (!submissionId) throw new ValidationError('This interview has no submission to review');

    const answers = await models.InterviewAnswer.findAll({ where: { sessionId: session.id } });
    const totalPossible = answers.reduce((s, a) => s + (a.pointsPossible || 0), 0);
    const totalAwarded = answers.reduce((s, a) => s + (Number(a.pointsAwarded) || 0), 0);
    const pct = totalPossible > 0 ? (totalAwarded / totalPossible) * 100 : 0;

    const submissionService = require('./submissionService');
    await submissionService.reviewSubmission(submissionId, mentorId, {
      decision: 'approved',
      isApproved: true,
      rating: Math.round((pct / 100) * 5 * 100) / 100, // 0–5, for the existing rating field
      feedbackText: overallNote || `Interview reviewed — ${totalAwarded}/${totalPossible} points.`,
      pointsPercent: pct,
    });

    return { totalAwarded, totalPossible, pointsPercent: Math.round(pct) };
  }

  /**
   * Finalize the attempt: mark the session submitted, move the task to 'submitted',
   * and drop a TaskSubmission marker so it appears in the mentor's Approvals queue
   * (the interview review UI in Phase 4 reads the session's answers).
   */
  async submit(sessionId, menteeId) {
    const session = await this._openSession(sessionId, menteeId);
    const task = await models.AssignedTask.findByPk(session.assignedTaskId);
    if (!task) throw new NotFoundError('Task not found');

    const answeredCount = await models.InterviewAnswer.count({ where: { sessionId } });

    return sequelize.transaction(async (transaction) => {
      await session.update({ status: 'submitted', submittedAt: new Date() }, { transaction });

      // Next submission version for this assignment (mirrors submissionService).
      const last = await models.TaskSubmission.findOne({
        where: { assignedTaskId: task.id },
        order: [['version', 'DESC']],
        transaction,
      });
      const version = (last?.version || 0) + 1;
      const isLate = task.dueDate ? new Date() > new Date(task.dueDate) : false;

      const submission = await models.TaskSubmission.create({
        assignedTaskId: task.id,
        version,
        submissionText: `Interview completed — ${answeredCount} answer${answeredCount === 1 ? '' : 's'} (attempt ${session.attemptNumber}).`,
        submissionUrls: [],
        status: 'pending',
        submittedAt: new Date(),
      }, { transaction });

      await task.update({
        status: 'submitted',
        submittedAt: new Date(),
        currentSubmissionVersion: version,
        isLate,
      }, { transaction });

      // Persist the session id on the submission meta-less way: store it via meta
      // on the session already; the reviewer resolves the session by task.
      await session.update({ meta: { ...(session.meta || {}), submissionId: submission.id } }, { transaction });

      return { submissionId: submission.id, sessionId: session.id, version };
    }).then(async (out) => {
      // Notify the mentor — same deep link as normal submissions (Approvals + drawer).
      try {
        const submitter = await models.User.findByPk(menteeId, { attributes: ['firstName', 'lastName'] });
        const name = submitter ? `${submitter.firstName} ${submitter.lastName}`.trim() : 'A mentee';
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.TASK_SUBMITTED,
          recipients: [{ userId: task.mentorId }],
          payload: {
            title: `${name} completed an interview`,
            message: `${name} finished the interview “${task.titleOverride || 'interview'}”. Review it when you can.`,
            actionUrl: `/mentor/approvals?task=${task.id}`,
            actionLabel: 'Review interview',
            relatedEntityType: 'task_submission',
            relatedEntityId: out.submissionId,
          },
          dedupe: { relatedEntityType: 'interview_submitted', relatedEntityId: out.submissionId },
        });
      } catch (e) {
        console.error('interview submit notification failed:', e.message);
      }
      return out;
    });
  }
}

module.exports = new InterviewSessionService();
