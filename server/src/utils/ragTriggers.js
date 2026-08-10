const ragIngestionService = require('../services/ragIngestionService');
const logger = require('./ragLogger');

/**
 * Trigger RAG ingestion for a given source without blocking the main event loop.
 * Fire-and-forget helper.
 */
function triggerIngestion(payload) {
  // Fire and forget
  ragIngestionService.enqueueIngestion(payload)
    .catch(err => {
      logger.error('trigger_ingestion_failed', { 
        error: err.message, 
        sourceType: payload.sourceType, 
        sourceId: payload.sourceId 
      });
    });
}

module.exports = {
  triggerIngestion
};
