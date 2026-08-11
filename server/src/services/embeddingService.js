const crypto = require('crypto');
const { models } = require('../db');
const groqService = require('./groqService');
const ragConfig = require('../config/ragConfig');
const { AppError } = require('../utils/errors/errorTypes');
const logger = require('../utils/ragLogger');

class EmbeddingError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500);
    this.name = 'EmbeddingError';
    this.originalError = originalError;
  }
}

class EmbeddingService {
  /**
   * Computes sha256 hash of text.
   */
  computeContentHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Sleeps for a given number of milliseconds.
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Backoff helper: 500ms -> 1000ms -> 2000ms...
   */
  _backoffMs(attempt) {
    return Math.pow(2, attempt) * 250;
  }

  /**
   * Takes an array of chunks, hashes them, skips existing ones, 
   * embeds the rest via API with retries, and returns the full enriched array.
   * 
   * @param {Array<{text: string, chunkIndex: number}>} chunks 
   * @param {string} [userId] - User ID to resolve personal AI configuration
   * @returns {Promise<Array<{text: string, chunkIndex: number, contentHash: string, embedding: Array<number>|null, skipped: boolean}>>}
   */
  async embedChunks(chunks, userId = null) {
    if (!chunks || chunks.length === 0) return [];

    // 1. Compute hashes
    const enrichedChunks = chunks.map(chunk => ({
      ...chunk,
      contentHash: this.computeContentHash(chunk.text),
      embedding: null,
      skipped: false
    }));

    const allHashes = enrichedChunks.map(c => c.contentHash);

    // 2. Query DB to find existing hashes for THIS mentor only
    const existingRows = await models.KnowledgeChunk.findAll({
      where: { 
        content_hash: allHashes,
        mentor_id: userId
      },
      attributes: ['content_hash', 'embedding'],
      raw: true
    });
    const hashToEmbedding = {};
    for (const row of existingRows) {
      if (row.embedding) {
        hashToEmbedding[row.content_hash] = row.embedding;
      }
    }

    // 3. Mark skipped chunks and copy existing embeddings
    const toEmbed = [];
    for (const chunk of enrichedChunks) {
      if (hashToEmbedding[chunk.contentHash]) {
        chunk.skipped = true;
        let vec = hashToEmbedding[chunk.contentHash];
        // Sequelize/pgvector might return a string "[0.1, 0.2]" or a Float32Array depending on driver
        if (typeof vec === 'string') {
          try { vec = JSON.parse(vec); } catch(e) {}
        } else if (vec instanceof Float32Array) {
          vec = Array.from(vec);
        }
        chunk.embedding = vec;
      } else {
        toEmbed.push(chunk);
      }
    }

    // 4. Batch embed the remainder
    if (toEmbed.length > 0) {
      const textsToEmbed = toEmbed.map(c => c.text);
      let embeddings = [];
      
      const { enabled, client, model, provider } = await groqService._resolve('rag_embedding', userId);

      // If AI isn't configured, we log warning and return chunks with null embeddings.
      if (!enabled || !client) {
        logger.warn('AI services not configured for embeddings. Ingesting chunks without vector embeddings.');
        return enrichedChunks;
      }

      // 5. Exponential Backoff Retry Loop
      let attempt = 0;
      const maxAttempts = 3;
      
      const { getAdapter } = require('./embeddingProviders');
      const adapter = getAdapter(provider, client?.apiKey);

      while (attempt < maxAttempts) {
        try {
          embeddings = await adapter.embed(textsToEmbed);
          break; // success
        } catch (error) {
          attempt++;
          // Categorize as transient vs permanent based on status codes.
          // 4xx errors (except 429 Rate Limit) are usually permanent.
          const status = error.status || error.statusCode || 500;
          const isTransient = status === 429 || status >= 500 || error.code === 'ECONNRESET';
          
          if (!isTransient || attempt >= maxAttempts) {
            throw new EmbeddingError(`Embedding API failed permanently after ${attempt} attempts: ${error.message}`, error);
          }
          
          // Wait and retry
          const backoff = this._backoffMs(attempt);
          await this._sleep(backoff);
        }
      }

      // 6. Map embeddings back to the enriched chunks
      for (let i = 0; i < toEmbed.length; i++) {
        toEmbed[i].embedding = embeddings[i];
      }
    }

    return enrichedChunks;
  }

  /**
   * Simple helper to embed a single string. Returns the embedding array.
   */
  async getEmbedding(text, userId = null) {
    const result = await this.embedChunks([{ text, chunkIndex: 0 }], userId);
    if (result && result.length > 0 && result[0].embedding) {
      return result[0].embedding;
    }
    throw new EmbeddingError('Failed to get embedding for text');
  }
}

module.exports = new EmbeddingService();
