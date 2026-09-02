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
      lastName: menteeMap[ev.mentee_id]?.lastName ?? '',
      email: menteeMap[ev.mentee_id]?.email ?? ''
    }));

    enrichedResults.sort((a, b) => b.match_score - a.match_score);

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
      logger.info(`[AI Eval Worker] Processing job ${job.id} (mentee ${job.menteeId}, run ${job.runId})`);
      const result = await processJob(job);

      job.status = 'completed';
      job.result = result;
      job.error = null;
      await job.save();

      const completedCount = await models.AIEvaluationQueue.count({
        where: { runId: job.runId, status: { [Op.in]: ['completed', 'failed'] } }
      });
      const totalCount = await models.AIEvaluationQueue.count({
        where: { runId: job.runId }
      });

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
      logger.error(`[AI Eval Worker] Job ${job.id} failed: ${jobError.message}`);

      job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      job.error = jobError.stack || jobError.message;
      await job.save();

      if (job.status === 'failed') {
        const completedCount = await models.AIEvaluationQueue.count({
          where: { runId: job.runId, status: { [Op.in]: ['completed', 'failed'] } }
        });
        const totalCount = await models.AIEvaluationQueue.count({
          where: { runId: job.runId }
        });

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

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  logger.info('AI evaluation worker stopped');
}

module.exports = { start, stop, tick };
