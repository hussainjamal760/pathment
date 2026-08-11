const ragConfig = require('../config/ragConfig');

class ChunkingService {
  /**
   * Split text into overlapping chunks using a simple word-based sliding window.
   * In a more complex setup, this might use tiktoken or similar, but a fast
   * whitespace-based tokenizer (assuming ~1.3 tokens/word) is a robust baseline
   * for simple English language text when no heavy dependency is desired.
   *
   * @param {string} text - The raw text to chunk.
   * @param {object} options - Options overriding defaults.
   * @param {number} [options.tokenSize] - Approximate max tokens per chunk.
   * @param {number} [options.overlap] - Approximate overlap tokens per chunk.
   * @returns {Array<{text: string, chunkIndex: number}>}
   */
  chunkText(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const tokenSize = options.tokenSize || ragConfig.chunkTokenSize;
    const overlap = options.overlap || ragConfig.chunkTokenOverlap;

    // Approximate words per token (1 word ≈ 1.3 tokens roughly).
    // So if tokenSize = 250, that's roughly 190 words.
    const WORDS_PER_TOKEN = 1 / 1.3;
    const wordSize = Math.floor(tokenSize * WORDS_PER_TOKEN);
    const wordOverlap = Math.floor(overlap * WORDS_PER_TOKEN);

    // Split text into words/punctuation sequences
    // Matches sequences of non-whitespace characters
    const tokens = text.match(/\S+/g) || [];

    if (tokens.length === 0) {
      return [];
    }

    const chunks = [];
    let i = 0;
    let chunkIndex = 0;

    while (i < tokens.length) {
      // Slice the current window of words
      const chunkTokens = tokens.slice(i, i + wordSize);
      
      // Join them back into text
      const chunkText = chunkTokens.join(' ');
      
      chunks.push({
        text: chunkText,
        chunkIndex
      });

      chunkIndex++;
      
      // Advance by the step size (size - overlap)
      // Ensure we always advance at least 1 word to prevent infinite loops
      const step = Math.max(1, wordSize - wordOverlap);
      i += step;
    }

    return chunks;
  }
}

module.exports = new ChunkingService();
