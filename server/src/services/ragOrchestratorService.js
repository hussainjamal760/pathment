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
  async queueReplyGeneration(messageId) {
    try {
      // 1. Fetch Message & Authorization Scope
      const message = await models.Message.findByPk(messageId, {
        include: [
          {
            model: models.Conversation,
            as: 'conversation',
            include: [
              {
                model: models.Enrollment,
                as: 'relatedEnrollment',
                include: [{ model: models.Program, as: 'program' }]
              },
              {
                model: models.ConversationParticipant,
                as: 'participants',
                include: [{ model: models.User, as: 'user' }]
              }
            ]
          }
        ]
      });

      if (!message) throw new Error(`Message ${messageId} not found`);

      // Determine scopes from conversation
      const conversation = message.conversation;
      const programId = conversation.relatedEnrollment ? conversation.relatedEnrollment.programId : null;

      // Identify the mentor in the conversation (assuming 1 mentor, 1 mentee)
      let mentorId = null;
      let menteeId = message.senderId; // the one who sent the message
      for (const p of conversation.participants) {
        if (p.user.role === 'mentor') {
          mentorId = p.user.id;
        }
      }

      // 2. Fetch Unlocked Roadmap Nodes (simulated for now)
      // In a real app, query the Roadmap/Node progress for this mentee
      const unlockedRoadmapNodeIds = [];

      // 3. Fetch Style Profile
      let styleProfile = null;
      if (mentorId) {
        styleProfile = await models.MentorStyleProfile.findOne({ where: { mentor_id: mentorId } });
      }

      // 4. Retrieve Context (Hybrid Search + RRF)
      const retrievedChunks = await retrievalService.retrieveContext({
        query: message.messageText,
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
        menteeMessage: message.messageText
      });

      // 6. Call LLM
      // Note: We instruct groqService to provide a self-reported confidence. 
      // To simulate this without complex JSON schema in generation, we can ask for a format,
      // or we can simulate the self-reported confidence for this implementation.
      // We will assume groqService.generateText handles standard generation.
      const llmOutput = await groqService.generateText({
        system: systemPrompt,
        prompt: userPrompt + '\n\nAppend your confidence score at the very end in brackets like [CONFIDENCE: 0.95]',
        feature: 'rag_generation',
        userId: mentorId,
        temperature: 0.4,
        maxTokens: 800
      });

      // Extract self-reported confidence
      let llmConfidence = 0.85; // default
      let draftText = llmOutput;
      const confMatch = llmOutput.match(/\[CONFIDENCE:\s*([0-9.]+)\]/);
      if (confMatch) {
        llmConfidence = parseFloat(confMatch[1]);
        draftText = llmOutput.replace(confMatch[0], '').trim();
      }

      // 7. Grounding Check
      let groundingScore = 0;
      let unsupportedClaims = [];
      let groundingCheckError = null;

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
        logger.error('grounding_check_failed', { messageId, error: error.message, draftText });
      }

      // 8. Branching Logic
      let finalConfidence = 0;
      let tier = 'abstain';

      if (groundingCheckError) {
        // Strict fallback to abstain on grounding error
        finalConfidence = 0;
        tier = 'abstain';
      } else {
        const confResult = groundingService.computeFinalConfidence({
          llmConfidence,
          groundingScore
        });
        finalConfidence = confResult.finalConfidence;
        tier = confResult.tier;
      }

      logger.info('rag_orchestration_complete', {
        messageId,
        llmConfidence,
        groundingScore,
        finalConfidence,
        tier
      });

      // 9. Execute Terminal Persistence Action
      if (tier === 'auto-reply') {
        await this._handleAutoReply(message, draftText, finalConfidence);
      } else if (tier === 'review') {
        await this._handleDraftReview(message, draftText, finalConfidence);
      } else {
        await this._handleAbstain(message, finalConfidence, unsupportedClaims, draftText, groundingCheckError);
      }

      return { tier, finalConfidence };

    } catch (error) {
      logger.error('rag_orchestration_failed', { messageId, error: error.message });
      throw error;
    }
  }

  async _handleAutoReply(originalMessage, draftText, confidence) {
    // Insert a sent message on behalf of the AI/Mentor
    const message = await models.Message.create({
      threadId: originalMessage.threadId,
      senderId: originalMessage.recipientId || null, // The mentor
      recipientId: originalMessage.senderId,
      messageText: draftText,
      metadata: { generatedBy: 'ai', confidence, autoReplied: true, isAiGenerated: true }
    });

    try {
      const { emitToConversation } = require('../socket');
      emitToConversation(originalMessage.threadId, 'message:new', {
        message: message.toJSON()
      });
    } catch (err) {
      logger.error('rag_socket_emit_failed', { event: 'message:new', error: err.message });
    }
  }

  async _handleDraftReview(originalMessage, draftText, confidence) {
    // Insert into MessageDrafts for the mentor to review
    const draft = await models.MessageDraft.create({
      messageId: originalMessage.id,
      mentorId: originalMessage.recipientId || null,
      menteeId: originalMessage.senderId,
      draftContent: draftText,
      confidenceScore: confidence,
      status: 'pending'
    });

    try {
      const { emitToUser } = require('../socket');
      const mentorId = originalMessage.recipientId || null;
      if (mentorId) {
        emitToUser(mentorId, 'ai_draft:new', {
          draft: draft.toJSON(),
          conversationId: originalMessage.threadId
        });
      }
    } catch (err) {
      logger.error('rag_socket_emit_failed', { event: 'ai_draft:new', error: err.message });
    }
  }

  async _handleAbstain(originalMessage, confidence, unsupportedClaims, draftText, groundingCheckError = null) {
    // Log the abstention and take no action, leaving the message for human intervention
    logger.info('rag_orchestration_abstained', {
      messageId: originalMessage.id,
      confidence,
      unsupportedClaims,
      groundingCheckError,
      draftText
    });
  }
}

module.exports = new RagOrchestratorService();
