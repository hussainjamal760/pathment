const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const certificateRenderer = require('../services/certificateRenderer');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const emailService = require('../services/emailService');
const notificationOrchestrator = require('../services/notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { certificateAwardedEmail } = require('../utils/emailTemplate');
const logger = require('../utils/logger');


const POLL_MS = Number(process.env.CERTIFICATE_WORKER_POLL_MS) || 10000; // 10 seconds
const MAX_ATTEMPTS = 5;

let timer = null;
let running = false;

/**
 * Process a single enqueued certificate job
 */
async function processJob(job) {
  const instance = await models.CertificateInstance.findOne({
    where: { id: job.instanceId },
    include: [
      {
        model: models.CertificateTemplate,
        as: 'template',
        include: [{ model: models.Program, as: 'program', required: false }]
      },
      { model: models.User, as: 'mentee' },
      { model: models.User, as: 'mentor', required: false },
      { model: models.User, as: 'issuer' }
    ]
  });

  if (!instance) {
    throw new Error(`Certificate instance ${job.instanceId} not found in database`);
  }

  const menteeName = `${instance.mentee.firstName} ${instance.mentee.lastName}`.trim();
  const mentorName = instance.mentor
    ? `${instance.mentor.firstName} ${instance.mentor.lastName}`.trim()
    : `${instance.issuer.firstName} ${instance.issuer.lastName}`.trim();

  const dateIssued = new Date(instance.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const enrollment = await models.Enrollment.findOne({
    where: { menteeId: instance.menteeId },
    include: [{ model: models.Program, as: 'program', required: false }]
  });
  const programName = instance.template?.program?.name || enrollment?.program?.name || 'Pathment Program';
  const fellowshipName = programName;

  const renderData = {
    menteeName,
    mentorName,
    dateIssued,
    fellowshipName,
    programName,
    issuerName: mentorName,
    issuerTitle: instance.mentor ? 'Mentor' : 'Pathment Admin'
  };

  const criteria = Array.isArray(instance.template.criteria) ? instance.template.criteria : [];
  const tierConfig = criteria.find(t => t.id === instance.tier);
  const badgeUrl = tierConfig ? tierConfig.badgeUrl : null;

  const templateClone = JSON.parse(JSON.stringify(instance.template.get({ plain: true })));
  if (Array.isArray(templateClone.config)) {
    templateClone.config = templateClone.config
      .map(el => {
        if (el.type === 'badge') {
          return { ...el, badgeUrl };
        }
        return el;
      })
      .filter(el => {
        if (el.type === 'badge') {
          return !!badgeUrl;
        }
        return true;
      });
  }

  const { pdfBuffer, pngBuffer } = await certificateRenderer.renderCertificate(templateClone, renderData);

  const [pdfResult, pngResult] = await Promise.all([
    uploadToCloudinary(pdfBuffer, 'pathment/certificates', 'auto'),
    uploadToCloudinary(pngBuffer, 'pathment/certificates', 'image')
  ]);

  instance.pdfUrl = pdfResult.secure_url;
  instance.imageUrl = pngResult.secure_url;
  await instance.save();

  const targetPath = instance.mentee.role === 'mentor' ? '/mentor/certificates' : '/mentee/certificates';
  const certificateLink = `${(process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}${targetPath}`;

  const criteriaMatch = criteria.find(c => c.id === instance.tier);
  const tierDisplayName = criteriaMatch ? criteriaMatch.name : (instance.tier.charAt(0).toUpperCase() + instance.tier.slice(1));

  const { subject, html } = certificateAwardedEmail({
    firstName: instance.mentee.firstName,
    lastName: instance.mentee.lastName,
    templateName: instance.template.name,
    tier: instance.tier,
    tierDisplayName,
    imageUrl: instance.imageUrl,
    certificateLink
  });

  await emailService.enqueue({
    to: instance.mentee.email,
    subject,
    html,
    emailType: 'certificate_awarded',
    recipientId: instance.menteeId,
    attachments: [
      {
        filename: `${instance.template.name.replace(/[^a-z0-9]/gi, '_')}.pdf`,
        content: pdfBuffer.toString('base64'),
        contentType: 'application/pdf'
      }
    ]
  });

  await notificationOrchestrator.dispatch({
    eventKey: NOTIFICATION_EVENTS.CERTIFICATE_AWARDED,
    recipients: [{ userId: instance.menteeId }],
    payload: {
      title: 'Certificate Awarded!',
      message: `Congratulations! You have been awarded a certificate for: "${instance.template.name}".`,
      actionUrl: `/mentee/certificates`,
      actionLabel: 'View Certificate',
      relatedEntityType: 'certificate_instance',
      relatedEntityId: instance.id
    }
  });
}

/**
 * Worker polling tick
 */
async function tick() {
  if (running) return;
  running = true;

  try {
    const STALE_LOCK_MS = 5 * 60 * 1000; // 5 minutes lock timeout
    const now = new Date();

    const job = await sequelize.transaction(async (t) => {
      const pendingJob = await models.CertificateQueue.findOne({
        where: {
          [Op.or]: [
            { status: 'pending' },
            {
              status: 'processing',
              lockedAt: { [Op.lt]: new Date(Date.now() - STALE_LOCK_MS) }
            }
          ],
          attempts: { [Op.lt]: MAX_ATTEMPTS }
        },
        order: [['createdAt', 'ASC']],
        lock: { level: t.LOCK.UPDATE, of: models.CertificateQueue },
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
      pendingJob.lockedAt = now;
      pendingJob.attempts += 1;
      await pendingJob.save({ transaction: t });

      return pendingJob;
    });

    if (!job) {
      running = false;
      return;
    }

    try {
      logger.info(`[Certificate Worker] Processing job ${job.id} (instance ${job.instanceId}, attempt ${job.attempts}/${MAX_ATTEMPTS})`);
      await processJob(job);

      job.status = 'completed';
      job.error = null;
      await job.save();
      logger.info(`[Certificate Worker] Job ${job.id} completed successfully.`);
    } catch (jobError) {
      logger.error(`[Certificate Worker] Job ${job.id} failed (attempt ${job.attempts}/${MAX_ATTEMPTS}): ${jobError.message}`);

      job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      job.error = jobError.stack || jobError.message;
      await job.save();
    }
  } catch (err) {
    logger.error(`[Certificate Worker] Loop error: ${err.message}`);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  logger.info(`Certificate worker started (polling every ${POLL_MS}ms)`);
}

async function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  // Graceful shutdown: wait for running tick to finish
  let waitCount = 0;
  while (running && waitCount < 10) {
    await new Promise(r => setTimeout(r, 500));
    waitCount++;
  }
  logger.info('Certificate worker stopped gracefully');
}

module.exports = {
  start,
  stop,
  tick
};
