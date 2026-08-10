const ragConfig = require('../config/ragConfig');

class PromptBuilderService {
  /**
   * Simple word-based token heuristic.
   */
  _estimateTokens(text) {
    if (!text) return 0;
    const words = text.match(/\S+/g) || [];
    return Math.ceil(words.length * 1.3);
  }

  /**
   * Sorts contexts by trust level (1 highest, 5 lowest) and trims the lowest priority
   * contexts first if the total exceeds the budget.
   * 
   * @param {Array<{level: number, content: string}>} levelContexts 
   * @param {number} budget 
   * @returns {string} The final assembled context string.
   */
  _assembleContext(levelContexts, budget) {
    if (!levelContexts || levelContexts.length === 0) return 'No additional context provided.';

    // Sort ascending by level (1 first, 5 last)
    const sorted = [...levelContexts].sort((a, b) => a.level - b.level);

    let currentTokens = 0;
    const includedContexts = [];

    for (const ctx of sorted) {
      const tokens = this._estimateTokens(ctx.content);
      if (currentTokens + tokens > budget && includedContexts.length > 0) {
        // Budget exceeded, drop this and all subsequent (lower priority) chunks
        break;
      }
      currentTokens += tokens;
      includedContexts.push(ctx.content);
    }

    return includedContexts.map((c, i) => `[Context ${i + 1}]:\n${c}`).join('\n\n');
  }

  /**
   * Formats the mentor's style profile into natural instructions.
   */
  _formatStyleProfile(styleProfile) {
    if (!styleProfile) return 'Adopt a helpful and professional tone.';

    const parts = [];
    if (styleProfile.tone) {
      parts.push(`Tone: ${styleProfile.tone}`);
    }
    if (styleProfile.vocabularyMappings && styleProfile.vocabularyMappings.length > 0) {
      parts.push(`Vocabulary Preferences: ${styleProfile.vocabularyMappings.join(', ')}`);
    }
    if (styleProfile.signature) {
      parts.push(`Signature: Always sign off with "${styleProfile.signature}"`);
    }
    if (styleProfile.customInstructions) {
      parts.push(`Additional Instructions: ${styleProfile.customInstructions}`);
    }

    if (parts.length === 0) return 'Adopt a helpful and professional tone.';

    return `STYLE PROFILE & PERSONA:\n${parts.join('\n')}`;
  }

  /**
   * Assembles the final prompt to be sent to the LLM.
   * 
   * @param {Object} options
   * @param {Array<{level: number, content: string}>} options.levelContexts
   * @param {Object} options.styleProfile
   * @param {string} options.menteeMessage
   * @returns {{ systemPrompt: string, userPrompt: string }}
   */
  buildPrompt({ levelContexts = [], styleProfile = null, menteeMessage }) {
    // Leave some token room for the system prompt itself and the mentee message
    const menteeTokens = this._estimateTokens(menteeMessage);
    const availableBudget = Math.max(500, (ragConfig.contextTokenBudget || 3000) - menteeTokens - 200);

    const contextText = this._assembleContext(levelContexts, availableBudget);
    const styleText = this._formatStyleProfile(styleProfile);

    const systemPrompt = `You are an AI assistant acting precisely as the Mentor.
You MUST speak in the first person ("I", "my") as if you are the Mentor. Never refer to yourself as an AI.

${styleText}

KNOWLEDGE CONTEXT:
${contextText}

CRITICAL INSTRUCTIONS:
1. You may ONLY answer questions that can be answered using the Knowledge Context above.
2. If the mentee asks a question that is entirely unrelated to the Knowledge Context (e.g., personal questions, general chit-chat, or out-of-scope topics), you MUST reply with exactly this phrase and nothing else: [ABSTAIN_NO_CONTEXT]
3. Do NOT politely refuse, do NOT apologize, and do NOT explain yourself if the answer is not in the context. Just output [ABSTAIN_NO_CONTEXT].
4. Do not invent or hallucinate facts.`;

    const userPrompt = `Mentee Message:\n"${menteeMessage}"\n\nPlease generate the reply:`;

    return { systemPrompt, userPrompt };
  }
}

module.exports = new PromptBuilderService();
