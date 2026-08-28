/**
 * aiEvaluationWorker — DB-backed queue processor for per-mentee AI evaluation.
 *
 * Same pattern as certificateWorker.js:
 *   - Polls `ai_evaluation_queue` for pending rows
 *   - Claims one job at a time with `FOR UPDATE SKIP LOCKED`
 *   - Calls evaluateSingleMentee for focused, accurate evaluation
 *   - Emits real-time progress via socket.io
 *   - When all jobs in a run complete, caches results on the template
 */
const { Op } = require('sequelize');
const { models, sequelize } = require('../../../db');
const { emitToUser } = require('../../../socket');
const aiEvaluationService = require('../services/aiEvaluationService');

const POLL_MS = Number(process.env.AI_EVAL_WORKER_POLL_MS) || 3000; // 3s — faster for responsiveness
const MAX_ATTEMPTS = 3;

let timer = null;
let running = false;

/**
 * Process a single evaluation job.
 */
async function processJob(job) {
  const template = await models.CertificateTemplate.findByPk(job.templateId);
  if (!template) {
    throw new Error(`Template ${job.templateId} not found`);
  }

  const menteePayload = job.menteePayload;
  const preCheckResult = job.preCheck;

  // Call AI for this ONE mentee
  const result = await aiEvaluationService.evaluateSingleMentee(
    template,
    menteePayload,
    preCheckResult,
    job.triggeredBy
  );

  return result;
}

/**
 * Check if all jobs in a run are finished and emit completion if so.
 */
async function checkRunCompletion(runId, triggeredBy) {
  const stats = await models.AIEvaluationQueue.findAll({
    where: { runId },
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['status'],
    raw: true
  });

  const statusMap = {};
  let total = 0;
  for (const s of stats) {
    statusMap[s.status] = parseInt(s.count, 10);
    total += parseInt(s.count, 10);
  }

  const pending = statusMap['pending'] || 0;
  const processing = statusMap['processing'] || 0;
  const completed = statusMap['completed'] || 0;
  const failed = statusMap['failed'] || 0;

  // Run is done when no jobs are pending or processing
  if (pending === 0 && processing === 0) {
    // Gather all completed results
    const finishedJobs = await models.AIEvaluationQueue.findAll({
      where: { runId, status: 'completed' },
      attributes: ['menteeId', 'result'],
      raw: true
    });

    const results = finishedJobs
      .map(j => j.result)
      .filter(Boolean);

    // Enrich results with mentee names
    const menteeIds = finishedJobs.map(j => j.menteeId);
    const mentees = menteeIds.length > 0
      ? await models.User.findAll({
          where: { id: { [Op.in]: menteeIds } },
          attributes: ['id', 'firstName', 'lastName', 'email'],
          raw: true
        })
      : [];
    const menteeMap = Object.fromEntries(mentees.map(m => [m.id, m]));

    const enrichedResults = results.map(ev => ({
      ...ev,
      firstName: menteeMap[ev.mentee_id]?.firstName ?? '',
      lastName:  menteeMap[ev.mentee_id]?.lastName  ?? '',
      email:     menteeMap[ev.mentee_id]?.email     ?? ''
    }));

    // Sort by match_score desc
    enrichedResults.sort((a, b) => b.match_score - a.match_score);

    // Cache on template
    const templateId = finishedJobs[0]
      ? (await models.AIEvaluationQueue.findOne({ where: { runId }, attributes: ['templateId'], raw: true }))?.templateId
      : null;

    if (templateId) {
      const ranAt = new Date().toISOString();
      await models.CertificateTemplate.update(
        { aiEvaluation: { results: enrichedResults, ranAt }, aiEvaluationRanAt: ranAt },
        { where: { id: templateId } }
      );
    }

    // Emit completion event
    emitToUser(triggeredBy, 'ai-eval:complete', {
      runId,
      results: enrichedResults,
      ranAt: new Date().toISOString(),
      total,
      completed,
      failed
    });

    console.log(`[AI Eval Worker] Run ${runId} complete: ${completed} done, ${failed} failed out of ${total}`);
  }
}

/**
 * Worker tick — claim and process one job.
 */
async function tick() {
  if (running) return;
  running = true;

  try {
    // Transactionally acquire a pending or timed-out processing job using skipLocked
    const job = await sequelize.transaction(async (t) => {
      const pendingJob = await models.AIEvaluationQueue.findOne({
        where: {
          [Op.or]: [
            { status: 'pending' },
            {
              status: 'processing',
              lockedAt: { [Op.lt]: new Date(Date.now() - 45000) } // older than 45 seconds (AI request timeout is 25s)
            }
          ],
          attempts: { [Op.lt]: MAX_ATTEMPTS }
        },
        order: [['createdAt', 'ASC']],
        lock: { level: t.LOCK.UPDATE, of: models.AIEvaluationQueue },
        skipLocked: true,
        transaction: t
      });

      if (!pendingJob) return null;

      // Claim it
      pendingJob.status = 'processing';
      pendingJob.lockedAt = new Date();
      pendingJob.attempts += 1;
      await pendingJob.save({ transaction: t });

      return pendingJob;
    });

    if (!job) {
      running = false;
      return;
    }

    try {
      console.log(`[AI Eval Worker] Processing job ${job.id} (mentee ${job.menteeId}, run ${job.runId})...`);
      const result = await processJob(job);

      job.status = 'completed';
      job.result = result;
      job.error = null;
      await job.save();

      // Count progress for this run
      const completedCount = await models.AIEvaluationQueue.count({
        where: { runId: job.runId, status: { [Op.in]: ['completed', 'failed'] } }
      });
      const totalCount = await models.AIEvaluationQueue.count({
        where: { runId: job.runId }
      });

      // Enrich with mentee name for the progress event
      const mentee = await models.User.findByPk(job.menteeId, {
        attributes: ['id', 'firstName', 'lastName', 'email'],
        raw: true
      });

      const enrichedResult = {
        ...result,
        firstName: mentee?.firstName ?? '',
        lastName:  mentee?.lastName  ?? '',
        email:     mentee?.email     ?? ''
      };

      // Emit progress to the user who triggered
      emitToUser(job.triggeredBy, 'ai-eval:progress', {
        runId: job.runId,
        menteeId: job.menteeId,
        result: enrichedResult,
        completed: completedCount,
        total: totalCount
      });

      console.log(`[AI Eval Worker] Job ${job.id} completed (${completedCount}/${totalCount})`);

      // Check if run is fully done
      await checkRunCompletion(job.runId, job.triggeredBy);

    } catch (jobError) {
      console.error(`[AI Eval Worker] Job ${job.id} failed:`, jobError.message);

      job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      job.error = jobError.stack || jobError.message;
      await job.save();

      // If permanently failed, still check run completion
      if (job.status === 'failed') {
        // Count and emit progress even for failures
        const completedCount = await models.AIEvaluationQueue.count({
          where: { runId: job.runId, status: { [Op.in]: ['completed', 'failed'] } }
        });
        const totalCount = await models.AIEvaluationQueue.count({
          where: { runId: job.runId }
        });

        // Build fallback result for failed evaluations
        const fallbackResult = aiEvaluationService.buildFallbackResult(
          job.menteePayload,
          job.preCheck
        );

        const mentee = await models.User.findByPk(job.menteeId, {
          attributes: ['id', 'firstName', 'lastName', 'email'],
          raw: true
        });

        emitToUser(job.triggeredBy, 'ai-eval:progress', {
          runId: job.runId,
          menteeId: job.menteeId,
          result: {
            ...fallbackResult,
            firstName: mentee?.firstName ?? '',
            lastName:  mentee?.lastName  ?? '',
            email:     mentee?.email     ?? '',
            _failed: true
          },
          completed: completedCount,
          total: totalCount
        });

        await checkRunCompletion(job.runId, job.triggeredBy);
      }
    }
  } catch (err) {
    console.error('[AI Eval Worker] Loop error:', err.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  console.log(`✓ AI evaluation worker started (poll ${POLL_MS}ms)`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  console.log('✗ AI evaluation worker stopped');
}

module.exports = { start, stop, tick };
