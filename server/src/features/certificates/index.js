const certificateWorker = require('./workers/certificateWorker');
const logger = require('../../utils/logger');

function initializeCertificates() {
  if (process.env.CERTIFICATE_WORKER_DISABLED !== 'true') {
    certificateWorker.start();
    logger.info('[Certificates] Subsystem initialized and worker started');
  } else {
    logger.info('[Certificates] Subsystem initialized (worker disabled)');
  }
}

module.exports = {
  initializeCertificates
};
