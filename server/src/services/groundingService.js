const groqService = require('./groqService');
const ragConfig = require('../config/ragConfig');
const logger = require('../utils/ragLogger');

class GroundingService {
  /**
   * Evaluates if a generated draft is grounded in the retrieved context.
   * Uses an LLM to verify claims and returns a grounding score (0-1) and unsupported claims.
   * 
   * @param {Object} options
   * @param {string} options.draftText - The generated text to verify
   * @param {Array<Object>} options.retrievedChunks - The chunks retrieved from the DB
   * @param {string} [options.userId] - The mentor ID to resolve AI configuration
   * @returns {Promise<{ groundingScore: number, unsupportedClaims: string[] }>}
   */
  async checkGrounding({ draftText, retrievedChunks = [], userId = null }) {
    if (!draftText || draftText.trim() === '') {
      return { groundingScore: 1.0, unsupportedClaims: [] };
    }

    const contextText = retrievedChunks.map((c, i) => `[Chunk ${i+1}]: ${c.content}`).join('\n\n');

    const systemPrompt = `You are a strict factual grounding verifier. 
Your task is to verify if the claims in the provided "Draft" are supported by the provided "Context".
Only use the Context. Do not use outside knowledge.
Return a valid JSON object with EXACTLY this structure:
{
  "groundingScore": <number between 0.0 and 1.0>,
  "unsupportedClaims": <array of strings, listing any factual claims in the draft NOT supported by the context>
}
If all facts are supported, score is 1.0 and unsupportedClaims is empty.
If the draft contains greetings, pleasantries, or questions that don't assert facts, do not penalize them.
Penalize only asserted facts, numbers, or rules that cannot be found in or deduced from the Context.`;

    const prompt = `Context:\n${contextText || 'No context provided.'}\n\nDraft:\n${draftText}`;

    try {
      let attempt = 0;
      let responseText = null;
      let latencyMs = 0;

      while (attempt < 2) {
        try {
          const startMs = performance.now();
          responseText = await groqService.generateText({
            system: systemPrompt,
            prompt,
            feature: 'rag_grounding',
            userId,
            temperature: 0.1, // very low temperature for deterministic evaluation
            maxTokens: 500
          });
          latencyMs = Math.round(performance.now() - startMs);
          break; // success
        } catch (error) {
          attempt++;
          if (attempt >= 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 500)); // short backoff
        }
      }

      // Parse JSON from the output
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Grounding LLM did not return JSON');
      }

      const result = JSON.parse(jsonMatch[0]);
      
      const groundingScore = typeof result.groundingScore === 'number' ? result.groundingScore : 0.0;
      const unsupportedClaims = Array.isArray(result.unsupportedClaims) ? result.unsupportedClaims : [];

      logger.info('rag_grounding_executed', {
        latencyMs,
        groundingScore,
        unsupportedCount: unsupportedClaims.length
      });

      return { groundingScore, unsupportedClaims };

    } catch (error) {
      logger.error('rag_grounding_failed', { error: error.message });
      // Bubble up the error to orchestrator so it can trigger fallback
      throw error;
    }
  }

  /**
   * Combines the LLM's self-reported confidence with the grounding score.
   * 
   * Strategy: By default we use 'min' to ensure a high self-reported confidence
   * cannot override a poor grounding score, downgrading ungrounded drafts from auto-reply.
   * 
   * @param {Object} options
   * @param {number} options.llmConfidence - Self-reported confidence (0-1)
   * @param {number} options.groundingScore - Grounding check score (0-1)
   * @returns {Object} { finalConfidence: number, tier: 'auto-reply'|'review'|'abstain' }
   */
  computeFinalConfidence({ llmConfidence, groundingScore }) {
    const strategy = ragConfig.groundingCombinationStrategy || 'min';
    let finalConfidence = 0;

    switch (strategy) {
      case 'average':
        finalConfidence = (llmConfidence + groundingScore) / 2;
        break;
      case 'weighted':
        // Favor grounding score heavily (70/30 split)
        finalConfidence = (llmConfidence * 0.3) + (groundingScore * 0.7);
        break;
      case 'min':
      default:
        // Use the lowest score (most conservative approach)
        finalConfidence = Math.min(llmConfidence, groundingScore);
        break;
    }

    let tier = 'abstain';
    if (finalConfidence >= ragConfig.autoReplyConfidenceThreshold) {
      tier = 'auto-reply';
    } else if (finalConfidence >= ragConfig.draftReviewConfidenceThreshold) {
      tier = 'review';
    }

    return { finalConfidence, tier };
  }
}

module.exports = new GroundingService();
