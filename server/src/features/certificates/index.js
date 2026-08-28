const certificateWorker = require('./workers/certificateWorker');
const aiEvaluationWorker = require('./workers/aiEvaluationWorker');
const logger = require('../../utils/logger');

function initializeCertificates() {
  if (process.env.CERTIFICATE_WORKER_DISABLED !== 'true') {
    certificateWorker.start();
    logger.info('[Certificates] Certificate rendering worker started');
  } else {
    logger.info('[Certificates] Certificate rendering worker disabled');
  }

  if (process.env.AI_EVAL_WORKER_DISABLED !== 'true') {
    aiEvaluationWorker.start();
    logger.info('[Certificates] AI evaluation worker started');
  } else {
    logger.info('[Certificates] AI evaluation worker disabled');
  }

  logger.info('[Certificates] Subsystem initialized');
}

module.exports = {
  initializeCertificates
};
