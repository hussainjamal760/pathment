const { models, sequelize } = require('../db');
const retrievalService = require('./retrievalService');
const promptBuilderService = require('./promptBuilderService');
const groqService = require('./groqService');
const groundingService = require('./groundingService');
const ragConfig = require('../config/ragConfig');
const logger = require('../utils/ragLogger');

class RagOrchestratorService {
  /**
   * Orchestrates the entire RAG pipeline for a given message.
   * 
   * @param {string} messageId - The ID of the incoming Mentee message
   */
  async generateDecision(context) {
    try {
      const { query, mentorId, menteeId, programId, conversationId } = context;

      // 2. Fetch Unlocked Roadmap Nodes (simulated for now)
      // TODO: Wire to real roadmap progress (models/tasks/RoadmapProgress).
      // Currently stubbed because we lack the integer step -> node UUID resolver.
      const unlockedRoadmapNodeIds = [];
      logger.warn('roadmap_retrieval_stubbed', { 
        conversationId, 
        warning: 'Roadmap-scoped retrieval is not yet supported. Any roadmap chunks will be silently filtered out.' 
      });

      // 3. Fetch Style Profile
      let styleProfile = null;
      if (mentorId) {
        styleProfile = await models.MentorStyleProfile.findOne({ where: { mentor_id: mentorId } });
      }

      // 4. Retrieve Context (Hybrid Search + RRF)
      const retrievedChunks = await retrievalService.retrieveContext({
        query,
        userId: menteeId,
        mentorId,
        programId,
        unlockedRoadmapNodeIds
      });

      // Map chunks to trust levels.
      // Example basic mapping (can be expanded based on source_type):
      const levelContexts = retrievedChunks.map(chunk => {
        let level = 5;
        if (chunk.visibility === 'mentor') level = 3;
        else if (chunk.visibility === 'roadmap') level = 2;
        else if (chunk.visibility === 'program') level = 4;
        return { level, content: chunk.content };
      });

      // 5. Build Prompt
      const { systemPrompt, userPrompt } = promptBuilderService.buildPrompt({
        levelContexts,
        styleProfile: styleProfile ? styleProfile.toJSON() : null,
        menteeMessage: query
      });

      // 6. Call LLM
      const llmOutput = await groqService.generateText({
        system: systemPrompt,
        prompt: userPrompt,
        feature: 'rag_generation',
        userId: mentorId,
        temperature: 0.4,
        maxTokens: 800
      });

      let draftText = llmOutput.trim();

      if (draftText.includes('[ABSTAIN_NO_CONTEXT]')) {
        logger.info('rag_orchestration_abstained_no_context', { conversationId });
        return { 
          tier: 'abstain', 
          draftText, 
          confidence: 0, 
          chunkIds: retrievedChunks.map(c => c.id), 
          unsupportedClaims: [], 
          groundingScore: 0, 
          groundingCheckError: 'Out of context fallback triggered' 
        };
      }

      let groundingScore = 0;
      let unsupportedClaims = [];
      let groundingCheckError = null;
      let finalConfidence = 0;
      let tier = 'abstain';

      try {
        const groundingResult = await groundingService.checkGrounding({
          draftText,
          retrievedChunks,
          userId: mentorId
        });
        groundingScore = groundingResult.groundingScore;
        unsupportedClaims = groundingResult.unsupportedClaims;
      } catch (error) {
        groundingCheckError = error.message;
        logger.error('grounding_check_failed', { conversationId, error: error.message, draftText });
      }

      if (groundingCheckError) {
        // Strict fallback to abstain on grounding error
        finalConfidence = 0;
        tier = 'abstain';
      } else {
        const confResult = groundingService.computeFinalConfidence({
          groundingScore,
          autoReplyEnabled: styleProfile?.autoReplyEnabled === true
        });
        finalConfidence = confResult.finalConfidence;
        tier = confResult.tier;
      }

      logger.info('rag_orchestration_complete', {
        conversationId,
        groundingScore,
        finalConfidence,
        tier
      });

      return {
        tier,
        draftText,
        confidence: finalConfidence,
        chunkIds: retrievedChunks.map(c => c.id),
        unsupportedClaims,
        groundingScore,
        groundingCheckError
      };

    } catch (error) {
      logger.error('rag_orchestration_failed', { conversationId: context?.conversationId, error: error.message });
      throw error;
    }
  }

}

module.exports = new RagOrchestratorService();
