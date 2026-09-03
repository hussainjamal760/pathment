/**
 * aiEvaluationWorker — DB-backed queue processor for per-mentee AI evaluation.
 *
 * Responsibilities:
 *   - Polls `ai_evaluation_queue` for pending rows.
 *   - Claims one job at a time using `FOR UPDATE SKIP LOCKED`.
 *   - Calls evaluateSingleMentee for focused evaluation.
 *   - Emits real-time progress via socket.io.
 *   - When all jobs in a run complete, caches results on the template.
 */
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { emitToUser } = require('../socket');
const aiEvaluationService = require('../services/aiEvaluationService');
const { enrichEvaluationResults } = require('../utils/aiEvalHelpers');
const logger = require('../utils/logger');

const POLL_MS = Number(process.env.AI_EVAL_WORKER_POLL_MS) || 3000;
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

  return aiEvaluationService.evaluateSingleMentee(
    template,
    job.menteePayload,
    job.preCheck,
    job.triggeredBy
  );
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

  if (pending === 0 && processing === 0) {
    const finishedJobs = await models.AIEvaluationQueue.findAll({
      where: { runId, status: 'completed' },
      attributes: ['menteeId', 'result'],
      raw: true
    });

    const results = finishedJobs
      .map(j => j.result)
      .filter(Boolean);

    const enrichedResults = await enrichEvaluationResults(results);

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

    emitToUser(triggeredBy, 'ai-eval:complete', {
      runId,
      results: enrichedResults,
      ranAt: new Date().toISOString(),
      total,
      completed,
      failed
    });

    logger.info(`[AI Eval Worker] Run ${runId} complete: ${completed} done, ${failed} failed out of ${total}`);
  }
}

/**
 * Worker tick — claim and process one job.
 */
async function tick() {
  if (running) return;
  running = true;

  try {
    const job = await sequelize.transaction(async (t) => {
      const pendingJob = await models.AIEvaluationQueue.findOne({
        where: {
          [Op.or]: [
            { status: 'pending' },
            {
              status: 'processing',
              lockedAt: { [Op.lt]: new Date(Date.now() - 45000) }
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

      // Exponential backoff check: if retrying, ensure backoff delay has elapsed
      if (pendingJob.attempts > 0 && pendingJob.status === 'pending') {
        const backoffMs = Math.pow(2, pendingJob.attempts - 1) * 3000;
        const lastUpdated = new Date(pendingJob.updatedAt).getTime();
        if (Date.now() - lastUpdated < backoffMs) {
          return null; // Skip for now, backoff in progress
        }
      }

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
      logger.info(`[AI Eval Worker] Processing job ${job.id} (mentee ${job.menteeId}, run ${job.runId}, attempt ${job.attempts}/${MAX_ATTEMPTS})`);
      const result = await processJob(job);

      job.status = 'completed';
      job.result = result;
      job.error = null;
      await job.save();

      const [{ completedCount, totalCount }] = await sequelize.query(
        `SELECT COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) AS "completedCount", COUNT(*) AS "totalCount" FROM ai_evaluation_queue WHERE run_id = :runId`,
        { replacements: { runId: job.runId }, type: sequelize.QueryTypes.SELECT }
      );

      const mentee = await models.User.findByPk(job.menteeId, {
        attributes: ['id', 'firstName', 'lastName', 'email'],
        raw: true
      });

      const enrichedResult = {
        ...result,
        firstName: mentee?.firstName ?? '',
        lastName: mentee?.lastName ?? '',
        email: mentee?.email ?? ''
      };

      emitToUser(job.triggeredBy, 'ai-eval:progress', {
        runId: job.runId,
        menteeId: job.menteeId,
        result: enrichedResult,
        completed: completedCount,
        total: totalCount
      });

      logger.info(`[AI Eval Worker] Job ${job.id} completed (${completedCount}/${totalCount})`);

      await checkRunCompletion(job.runId, job.triggeredBy);
    } catch (jobError) {
      logger.error(`[AI Eval Worker] Job ${job.id} failed (attempt ${job.attempts}/${MAX_ATTEMPTS}): ${jobError.message}`);

      job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      job.error = jobError.stack || jobError.message;
      await job.save();

      if (job.status === 'failed') {
        const [{ completedCount, totalCount }] = await sequelize.query(
          `SELECT COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) AS "completedCount", COUNT(*) AS "totalCount" FROM ai_evaluation_queue WHERE run_id = :runId`,
          { replacements: { runId: job.runId }, type: sequelize.QueryTypes.SELECT }
        );

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
            lastName: mentee?.lastName ?? '',
            email: mentee?.email ?? '',
            _failed: true
          },
          completed: completedCount,
          total: totalCount
        });

        await checkRunCompletion(job.runId, job.triggeredBy);
      }
    }
  } catch (err) {
    logger.error(`[AI Eval Worker] Loop error: ${err.message}`);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  logger.info(`AI evaluation worker started (poll ${POLL_MS}ms)`);
}

async function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  let waitCount = 0;
  while (running && waitCount < 10) {
    await new Promise(r => setTimeout(r, 500));
    waitCount++;
  }
  logger.info('AI evaluation worker stopped gracefully');
}

module.exports = { start, stop, tick };
