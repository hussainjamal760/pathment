const ragEvents = require('./ragTriggers');
const logger = require('./ragLogger');

/**
 * Initializes RAG event listeners.
 * By decoupling the listeners, the core domain services (like messaging)
 * can emit events without directly requiring heavy RAG modules.
 */
function initRagListeners() {
  ragEvents.on('rag:orchestrate', (context, originalMessage) => {
    const ragOrchestratorService = require('../services/ragOrchestratorService');
    const messagingService = require('../services/messagingService');

    ragOrchestratorService.generateDecision(context)
      .then(decision => {
        // messagingService handles the side-effects of the decision
        return messagingService._handleRagDecision(originalMessage, decision);
      })
      .catch(err => {
        logger.error('rag_orchestration_fire_and_forget_failed', {
          messageId: originalMessage.id,
          error: err.message
        });
      });
  });

  ragEvents.on('rag:ingest', (payload) => {
    const ragIngestionService = require('../services/ragIngestionService');
    
    ragIngestionService.enqueueIngestion(payload)
      .catch(err => {
        logger.error('trigger_ingestion_failed', { 
          error: err.message, 
          sourceType: payload.sourceType, 
          sourceId: payload.sourceId 
        });
      });
  });
}

module.exports = { initRagListeners };
