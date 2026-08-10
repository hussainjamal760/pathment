const { models, sequelize } = require('../db');
const ragConfig = require('../config/ragConfig');
const embeddingService = require('./embeddingService');
const ragLogger = require('../utils/ragLogger');
const crypto = require('crypto');

class StyleLearningService {
  /**
   * Evaluates linguistic differences between two strings to propose a bounded shift
   * in style dimensions (e.g. brevity, formality).
   * 
   * In a production system, this could invoke an LLM evaluation prompt or run 
   * advanced NLP heuristics. For this MVP, we use simple length and vocabulary heuristics.
   */
  _analyzeStyleDiff(original, edited) {
    const originalLength = original.length;
    const editedLength = edited.length;
    
    let brevityShift = 0;
    if (editedLength < originalLength) {
      brevityShift = 0.5; // Mentor prefers shorter
    } else if (editedLength > originalLength) {
      brevityShift = -0.5; // Mentor prefers longer
    }

    // A real implementation would analyze vocabulary formality, emoji usage, etc.
    let formalityShift = 0;
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    const originalEmojis = (original.match(emojiRegex) || []).length;
    const editedEmojis = (edited.match(emojiRegex) || []).length;

    if (editedEmojis < originalEmojis) {
      formalityShift = 0.5; // Removing emojis = more formal
    } else if (editedEmojis > originalEmojis) {
      formalityShift = -0.5; // Adding emojis = less formal
    }

    return { brevity: brevityShift, formality: formalityShift };
  }

  /**
   * Applies a proposed shift to a style vector, ensuring no single shift exceeds 
   * `maxStyleDeltaPerUpdate` and values stay bounded between 0 and 1.
   */
  _applyBoundedShift(currentValue, proposedShift, maxDelta) {
    const safeCurrent = typeof currentValue === 'number' ? currentValue : 0.5; // Default middle
    const boundedShift = Math.max(-maxDelta, Math.min(maxDelta, proposedShift));
    return Math.max(0, Math.min(1, safeCurrent + boundedShift));
  }

  async processEditHistory(editHistoryId) {
    const editHistory = await models.MentorEditHistory.findByPk(editHistoryId);
    if (!editHistory || editHistory.processed) {
      return null;
    }

    return sequelize.transaction(async (transaction) => {
      // 1. Re-embed the final approved text as Level-4 Reference
      try {
        const contentHash = crypto.createHash('sha256').update(editHistory.finalContent).digest('hex');
        
        // Ensure idempotency
        const existingChunk = await models.KnowledgeChunk.findOne({
          where: {
            sourceType: 'message',
            sourceId: editHistory.id,
            chunkIndex: 0,
            contentHash
          },
          transaction
        });

        if (!existingChunk) {
          const embeddingVector = await embeddingService.getEmbedding(editHistory.finalContent);
          
          await models.KnowledgeChunk.create({
            sourceType: 'message',
            sourceId: editHistory.id,
            chunkIndex: 0,
            contentHash,
            content: editHistory.finalContent,
            embedding: `[${embeddingVector.join(',')}]`,
            mentorId: editHistory.mentorId,
            visibility: 'mentor'
          }, { transaction });
          
          ragLogger.info('style_learning_chunk_embedded', { mentorId: editHistory.mentorId, editHistoryId });
        }
      } catch (err) {
        ragLogger.error('style_learning_embedding_failed', { editHistoryId, error: err.message });
        // We do not throw here to allow style profile learning to continue even if embedding fails
      }

      // 2. Style Learning (Only if significant)
      if (editHistory.editDistance >= ragConfig.editDistanceSignificanceThreshold) {
        let styleProfile = await models.MentorStyleProfile.findOne({
          where: { mentorId: editHistory.mentorId },
          lock: transaction.LOCK.UPDATE,
          transaction
        });

        if (!styleProfile) {
          styleProfile = await models.MentorStyleProfile.create({
            mentorId: editHistory.mentorId,
            tone: { brevity: 0.5, formality: 0.5 },
            vocabulary: {}
          }, { transaction });
        }

        const originalTone = { ...styleProfile.tone };
        const shifts = this._analyzeStyleDiff(editHistory.originalContent, editHistory.finalContent);
        
        const maxDelta = ragConfig.maxStyleDeltaPerUpdate;
        
        const updatedTone = {
          brevity: this._applyBoundedShift(originalTone.brevity, shifts.brevity, maxDelta),
          formality: this._applyBoundedShift(originalTone.formality, shifts.formality, maxDelta)
        };

        await styleProfile.update({ tone: updatedTone }, { transaction });

        ragLogger.info('style_profile_updated', {
          mentorId: editHistory.mentorId,
          editHistoryId,
          before: originalTone,
          after: updatedTone,
          shifts
        });
      } else {
        ragLogger.info('style_learning_skipped', { 
          mentorId: editHistory.mentorId, 
          editHistoryId, 
          reason: 'Edit distance below significance threshold' 
        });
      }

      // 3. Mark as processed
      await editHistory.update({ processed: true }, { transaction });
      
      return true;
    });
  }
}

module.exports = new StyleLearningService();
