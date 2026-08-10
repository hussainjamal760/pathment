const { models } = require('../db');
const styleLearningService = require('../services/styleLearningService');
const ragConfig = require('../config/ragConfig');
const ragLogger = require('../utils/ragLogger');

class StyleLearningWorker {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.intervalId) return;
    ragLogger.info('style_learning_worker_started', { intervalMs: ragConfig.styleLearningPollIntervalMs });
    
    this.intervalId = setInterval(() => this.processNextBatch(), ragConfig.styleLearningPollIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      ragLogger.info('style_learning_worker_stopped');
    }
  }

  async processNextBatch() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Find unprocessed records
      const pendingEdits = await models.MentorEditHistory.findAll({
        where: { processed: false },
        limit: ragConfig.styleLearningBatchSize,
        order: [['createdAt', 'ASC']]
      });

      for (const edit of pendingEdits) {
        try {
          await styleLearningService.processEditHistory(edit.id);
        } catch (err) {
          ragLogger.error('style_learning_worker_process_error', { 
            editHistoryId: edit.id, 
            error: err.message 
          });
        }
      }
    } catch (err) {
      ragLogger.error('style_learning_worker_batch_error', { error: err.message });
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = new StyleLearningWorker();
