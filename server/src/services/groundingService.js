const groqService = require('./groqService');
const embeddingService = require('./embeddingService');
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
    if (!draftText || draftText.trim() === '' || retrievedChunks.length === 0) {
      return { groundingScore: 1.0, unsupportedClaims: [] };
    }

    // 1. Compute out-of-band confidence via embedding similarity
    let groundingScore = 0;
    try {
      // Split draft into sentences (basic regex for punctuation boundaries)
      const sentences = draftText.match(/[^.!?]+[.!?]+/g) || [draftText];
      
      const sentenceEmbeddings = await Promise.all(
        sentences.map(s => embeddingService.getEmbedding(s.trim(), userId))
      );
      
      const chunkEmbeddings = await Promise.all(
        retrievedChunks.map(c => embeddingService.getEmbedding(c.content, userId))
      );

      // Compute max cosine similarity for each sentence against all chunks
      const sentenceScores = sentenceEmbeddings.map(sVec => {
        const similarities = chunkEmbeddings.map(cVec => this._cosineSimilarity(sVec, cVec));
        return Math.max(...similarities);
      });

      // Average the sentence similarities
      groundingScore = sentenceScores.reduce((a, b) => a + b, 0) / sentenceScores.length;
    } catch (err) {
      logger.error('rag_embedding_confidence_failed', { error: err.message });
      throw err;
    }

    const contextText = retrievedChunks.map((c, i) => `[Chunk ${i+1}]: ${c.content}`).join('\n\n');

    const systemPrompt = `You are a strict factual grounding verifier. 
Your task is to verify if the claims in the provided "Draft" are supported by the provided "Context".
Only use the Context. Do not use outside knowledge.
Return a valid JSON object with EXACTLY this structure:
{
  "unsupportedClaims": <array of strings, listing any factual claims in the draft NOT supported by the context>
}
If all facts are supported, unsupportedClaims is empty.
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
   * Combines out-of-band confidence with feature flag
   * @param {Object} options
   * @param {number} options.groundingScore - Out-of-band grounding check score (0-1)
   * @param {boolean} options.autoReplyEnabled - Feature flag for auto-reply tier
   * @returns {Object} { finalConfidence: number, tier: 'auto-reply'|'review'|'abstain' }
   */
  computeFinalConfidence({ groundingScore, autoReplyEnabled = false }) {
    let finalConfidence = groundingScore;

    let tier = 'abstain';
    if (autoReplyEnabled && finalConfidence >= ragConfig.autoReplyConfidenceThreshold) {
      tier = 'auto-reply';
    } else if (finalConfidence >= ragConfig.draftReviewConfidenceThreshold) {
      tier = 'review';
    }

    return { finalConfidence, tier };
  }

  _cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

module.exports = new GroundingService();
