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

    // 2. Query DB to find existing hashes
    const existingRows = await models.KnowledgeChunk.findAll({
      where: { content_hash: allHashes },
      attributes: ['content_hash'],
      raw: true
    });
    const existingHashes = new Set(existingRows.map(r => r.content_hash));

    // 3. Mark skipped chunks
    const toEmbed = [];
    for (const chunk of enrichedChunks) {
      if (existingHashes.has(chunk.contentHash)) {
        chunk.skipped = true;
      } else {
        toEmbed.push(chunk);
      }
    }

    // 4. Batch embed the remainder
    if (toEmbed.length > 0) {
      const textsToEmbed = toEmbed.map(c => c.text);
      let embeddings = [];
      
      const { enabled, client, model, provider, apiKey } = await groqService._resolve('rag_embedding', userId);

      // If AI isn't configured, we log warning and return chunks with null embeddings.
      if (!enabled || (!client && provider !== 'gemini')) {
        logger.warn('AI services not configured for embeddings. Ingesting chunks without vector embeddings.');
        return enrichedChunks;
      }

      let embedModel = ragConfig.embeddingModel || model || 'text-embedding-3-small';
      if (provider === 'gemini') {
        embedModel = 'gemini-embedding-001';
      }

      // 5. Exponential Backoff Retry Loop
      let attempt = 0;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        try {
          if (provider === 'gemini') {
            const embedPromises = textsToEmbed.map(async (t) => {
              const geminiReqBody = {
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text: t }] }
              };
              const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiReqBody)
              });
              if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Gemini API Error: ${res.status} ${errBody}`);
              }
              const data = await res.json();
              return data.embedding; // The response format for embedContent is { embedding: { values: [...] } }
            });
            
            const geminiEmbeddings = await Promise.all(embedPromises);
            
            embeddings = geminiEmbeddings.map(d => {
              let vec = d.values;
              if (vec && vec.length > 1536) {
                vec = vec.slice(0, 1536);
              } else if (vec && vec.length < 1536) {
                const padded = new Array(1536).fill(0);
                for (let j = 0; j < vec.length; j++) {
                  padded[j] = vec[j];
                }
                vec = padded;
              }
              return vec;
            });
          } else {
            // Calling the OpenAI-compatible embeddings API endpoint
            const reqBody = {
              model: embedModel,
              input: textsToEmbed,
              dimensions: ragConfig.embeddingDimensions || 1536
            };
            const response = await client.embeddings.create(reqBody);

            // response.data is an array of objects { embedding: [...] }
            embeddings = response.data.map(d => {
              let vec = d.embedding;
              if (vec && vec.length > 1536) {
                vec = vec.slice(0, 1536);
              } else if (vec && vec.length < 1536) {
                const padded = new Array(1536).fill(0);
                for (let j = 0; j < vec.length; j++) {
                  padded[j] = vec[j];
                }
                vec = padded;
              }
              return vec;
            });
          }
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
