const { Op } = require('sequelize');
const { models, sequelize } = require('../../../db');
const certificateRenderer = require('../services/certificateRenderer');
const { uploadToCloudinary } = require('../../../utils/cloudinaryUpload');
const emailService = require('../../../services/emailService');
const notificationOrchestrator = require('../../../services/notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../../../config/notificationMatrix');

const POLL_MS = Number(process.env.CERTIFICATE_WORKER_POLL_MS) || 10000; // 10 seconds
const MAX_ATTEMPTS = 5;

let timer = null;
let running = false;

/**
 * Process a single enqueued certificate job
 */
async function processJob(job) {
  // Fetch detailed instance information
  const instance = await models.CertificateInstance.findOne({
    where: { id: job.instanceId },
    include: [
      { model: models.CertificateTemplate, as: 'template' },
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

  // Query cohort program/fellowship details for variables replacement
  const enrollment = await models.Enrollment.findOne({
    where: { menteeId: instance.menteeId },
    include: [{ model: models.Program, as: 'program', required: false }]
  });
  const fellowshipName = enrollment?.program?.name || 'Pathment Fellowship';

  const renderData = {
    menteeName,
    mentorName,
    dateIssued,
    fellowshipName,
    issuerName: mentorName,
    issuerTitle: instance.mentor ? 'Mentor' : 'Pathment Admin'
  };

  // Resolve dynamic tier badge URL from custom criteria configurations
  const criteria = Array.isArray(instance.template.criteria) ? instance.template.criteria : [];
  const tierConfig = criteria.find(t => t.id === instance.tier);
  const badgeUrl = tierConfig ? tierConfig.badgeUrl : null;

  // Clone template and filter/inject badge properties
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

  // 1. Render PDF and PNG formats using Puppeteer
  const { pdfBuffer, pngBuffer } = await certificateRenderer.renderCertificate(templateClone, renderData);

  // 2. Upload both files to Cloudinary in parallel
  const [pdfResult, pngResult] = await Promise.all([
    uploadToCloudinary(pdfBuffer, 'pathment/certificates', 'auto'),
    uploadToCloudinary(pngBuffer, 'pathment/certificates', 'image')
  ]);

  // 3. Save resulting Cloudinary URLs to DB
  instance.pdfUrl = pdfResult.secure_url;
  instance.imageUrl = pngResult.secure_url;
  await instance.save();


  // 4. Send email with PDF attachment using the pre-existing email queue
  const targetPath = instance.mentee.role === 'mentor' ? '/mentor/certificates' : '/mentee/certificates';
  const certificateLink = `${(process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '')}${targetPath}`;

  const criteriaMatch = criteria.find(c => c.id === instance.tier);
  const tierDisplayName = criteriaMatch ? criteriaMatch.name : (instance.tier.charAt(0).toUpperCase() + instance.tier.slice(1));

  await emailService.enqueue({
    to: instance.mentee.email,
    subject: `Congratulations! Your certificate for "${instance.template.name}" is ready`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header banner -->
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">PATHMENT</span>
          </div>

          <!-- Body content -->
          <div style="padding: 32px 24px; text-align: center;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 24px; font-weight: 800; color: #1e293b; display: block; margin-bottom: 8px;">Congratulations, ${instance.mentee.firstName}! 🎉</span>
              <p style="font-size: 14px; color: #64748b; margin: 0; font-weight: 500;">You have successfully earned a new program credential.</p>
            </div>

            <!-- Image preview -->
            ${instance.imageUrl ? `
            <div style="margin: 24px 0; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
              <img src="${instance.imageUrl}" alt="Certificate Preview" style="width: 100%; max-width: 100%; display: block; height: auto;" />
            </div>
            ` : ''}

            <!-- Metadata Box -->
            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: left;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="color: #64748b; font-weight: 600; padding: 4px 0;">Credential Name:</td>
                  <td style="color: #1e293b; font-weight: 700; padding: 4px 0; text-align: right;">${instance.template.name}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600; padding: 4px 0;">Awarded Tier:</td>
                  <td style="color: #1e293b; font-weight: 700; padding: 4px 0; text-align: right; text-transform: uppercase; font-size: 11px;">
                    <span style="background-color: ${instance.tier === 'gold' ? '#f59e0b' : instance.tier === 'silver' ? '#64748b' : '#b45309'}; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: 800;">
                      ${tierDisplayName}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600; padding: 4px 0;">Recipient:</td>
                  <td style="color: #1e293b; font-weight: 700; padding: 4px 0; text-align: right;">${instance.mentee.firstName} ${instance.mentee.lastName}</td>
                </tr>
              </table>
            </div>

            <!-- Call to action button -->
            <div style="margin: 32px 0 16px 0;">
              <a href="${certificateLink}" target="_blank" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-size: 13px; font-weight: 700; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2); transition: all 0.2s; display: inline-block;">
                View in Dashboard
              </a>
            </div>

            <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; font-weight: 500;">
              A print-ready official PDF version of your certificate is also attached to this email.
            </p>
          </div>

          <!-- Footer content -->
          <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; font-weight: 500;">
            <p style="margin: 0 0 8px 0;">© ${new Date().getFullYear()} Pathment Platform. All rights reserved.</p>
            <p style="margin: 0;">Keep pushing forward, build your roadmap, achieve greatness!</p>
          </div>
        </div>
      </div>
    `,
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

  // 5. Send in-app notification to the mentee
  await notificationOrchestrator.dispatch({
    eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED, // Reusing task channel
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
    // Transactionally acquire a pending job using skipLocked (Outbox Pattern)
    const job = await sequelize.transaction(async (t) => {
      const pendingJob = await models.CertificateQueue.findOne({
        where: {
          status: 'pending',
          attempts: { [Op.lt]: MAX_ATTEMPTS }
        },
        order: [['createdAt', 'ASC']],
        lock: { level: t.LOCK.UPDATE, of: models.CertificateQueue },
        skipLocked: true,
        transaction: t
      });

      if (!pendingJob) return null;

      // Lock and claim it immediately inside the transaction
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
      console.log(`[Certificate Worker] Processing job ${job.id} (instance ${job.instanceId})...`);
      await processJob(job);

      job.status = 'completed';
      job.error = null;
      await job.save();
      console.log(`[Certificate Worker] Job ${job.id} completed successfully.`);
    } catch (jobError) {
      console.error(`[Certificate Worker] Job ${job.id} failed:`, jobError.message);

      job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      job.error = jobError.stack || jobError.message;
      await job.save();
    }
  } catch (err) {
    console.error('[Certificate Worker] Loop error:', err.message);
  } finally {
    running = false;
  }
}

/**
 * Starts the worker
 */
function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  console.log(`✓ Certificate worker started (polling every ${POLL_MS}ms)`);
}

/**
 * Stops the worker
 */
function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log('✗ Certificate worker stopped');
}

module.exports = {
  start,
  stop,
  tick
};
