const crypto = require('crypto');
const { sequelize } = require('../db');
const embeddingService = require('./embeddingService');
const ragConfig = require('../config/ragConfig');
const logger = require('../utils/ragLogger');

class RetrievalService {
  /**
   * Helper to estimate tokens (1 word ~ 1.3 tokens).
   */
  _estimateTokens(text) {
    if (!text) return 0;
    const words = text.match(/\S+/g) || [];
    return Math.ceil(words.length * 1.3);
  }

  /**
   * Fetch context using Hybrid Search (pgvector cosine + FTS tsquery) and RRF.
   *
   * @param {Object} options
   * @param {string} options.query - The raw query string
   * @param {string} [options.userId] - The user performing the query
   * @param {string} [options.mentorId] - Mentor scope if applicable
   * @param {string} [options.programId] - Program scope if applicable
   * @param {Array<string>} [options.unlockedRoadmapNodeIds=[]] - Roadmap scopes unlocked by the user
   */
  async retrieveContext({ query, userId, mentorId, programId, unlockedRoadmapNodeIds = [] }) {
    const startMs = performance.now();
    const queryHash = crypto.createHash('sha256').update(query).digest('hex');

    if (!query || query.trim() === '') {
      return [];
    }

    try {
      // 1. Generate Embedding for the query
      let queryVector = null;
      try {
        const embeddedChunks = await embeddingService.embedChunks([{ text: query, chunkIndex: 0 }], mentorId);
        queryVector = embeddedChunks[0]?.embedding || null;
      } catch (err) {
        logger.warn('rag_retrieval_embedding_failed', { queryHash, error: err.message });
      }

      // 2. Prepare FTS query string
      // A simple tsquery preparation (replace spaces with & or | for postgres)
      // In a real app, `websearch_to_tsquery` is highly recommended, but we can do it directly in SQL.
      
      // 3. Authorization Filter Clause
      // Strictly applied at the SQL level. No app-level filtering.
      // Parameterizing arrays in Sequelize replacements is tricky, so we'll use a direct parameter replacement
      // where ANY(:roadmaps) is handled properly by Sequelize Postgres dialect if provided as an array.
      const authWhere = `
        visibility = 'public'
        OR (visibility = 'program' AND program_id = :programId)
        OR (visibility = 'mentor' AND mentor_id = :mentorId)
        OR (visibility = 'roadmap' AND source_id IN (:roadmapIds))
      `;

      // 4. Vector Search (Cosine similarity <=> operator in pgvector)
      const vectorQuery = `
        SELECT id, content, (embedding <=> :vector::vector) as distance
        FROM knowledge_chunks
        WHERE (${authWhere})
        ORDER BY embedding <=> :vector::vector
        LIMIT 50
      `;

      // 5. FTS Search
      const ftsQuery = `
        SELECT id, content, ts_rank(search_vector, websearch_to_tsquery('english', :queryText)) as rank
        FROM knowledge_chunks
        WHERE (${authWhere})
        ORDER BY rank DESC
        LIMIT 50
      `;

      const replacements = {
        queryText: query,
        programId: programId || null,
        mentorId: mentorId || null,
        roadmapIds: unlockedRoadmapNodeIds.length ? unlockedRoadmapNodeIds : [null] // prevent empty array syntax errors
      };

      // Execute both in parallel, but fallback to FTS only if embeddings failed
      let vectorResults = [];
      let ftsResults = [];
      
      const promises = [
        sequelize.query(ftsQuery, { replacements, type: sequelize.QueryTypes.SELECT }).then(res => { ftsResults = res; })
      ];

      if (queryVector) {
        replacements.vector = `[${queryVector.join(',')}]`;
        promises.push(
          sequelize.query(vectorQuery, { replacements, type: sequelize.QueryTypes.SELECT }).then(res => { vectorResults = res; })
        );
      } else {
        logger.warn('rag_retrieval_no_vector', { queryHash, message: 'Falling back to FTS only' });
      }

      await Promise.all(promises);

      // 6. Reciprocal Rank Fusion (RRF)
      const k = ragConfig.rrfK || 60;
      const scores = new Map(); // id -> { content, score, vectorRank, ftsRank }

      // Process Vector results (Rank 1 = index 0)
      vectorResults.forEach((row, idx) => {
        const rank = idx + 1;
        const score = 1 / (k + rank);
        scores.set(row.id, { 
          id: row.id, 
          content: row.content, 
          score, 
          vectorRank: rank, 
          ftsRank: null 
        });
      });

      // Process FTS results
      ftsResults.forEach((row, idx) => {
        if (row.rank <= 0) return; // ignore zero-rank FTS matches

        const rank = idx + 1;
        const rrfAddition = 1 / (k + rank);

        if (scores.has(row.id)) {
          const entry = scores.get(row.id);
          entry.score += rrfAddition;
          entry.ftsRank = rank;
        } else {
          scores.set(row.id, { 
            id: row.id, 
            content: row.content, 
            score: rrfAddition, 
            vectorRank: null, 
            ftsRank: rank 
          });
        }
      });

      // Sort by RRF descending
      const sorted = Array.from(scores.values()).sort((a, b) => b.score - a.score);

      // 7. Token-Aware Trimming
      const maxTokens = ragConfig.contextTokenBudget || 1500;
      let currentTokens = 0;
      const finalChunks = [];
      const finalRanks = []; // for logging

      for (const item of sorted) {
        const tokens = this._estimateTokens(item.content);
        if (currentTokens + tokens > maxTokens && finalChunks.length > 0) {
          // If adding this chunk pushes us over budget, and we already have at least one chunk, stop.
          // (We ensure we always return at least one if available, even if it's slightly over budget)
          break;
        }
        
        currentTokens += tokens;
        finalChunks.push({ id: item.id, content: item.content });
        finalRanks.push({ id: item.id, score: item.score, vec: item.vectorRank, fts: item.ftsRank });
      }

      const latencyMs = Math.round(performance.now() - startMs);

      // 8. Privacy-Preserving Logging
      logger.info('rag_retrieval_executed', {
        queryHash,
        latencyMs,
        candidateCounts: {
          vector: vectorResults.length,
          fts: ftsResults.length
        },
        returnedChunkIds: finalChunks.map(c => c.id),
        ranks: finalRanks // Do not log 'content'
      });

      return finalChunks;

    } catch (e) {
      const latencyMs = Math.round(performance.now() - startMs);
      logger.error('rag_retrieval_failed', {
        queryHash,
        latencyMs,
        error: e.message
      });
      throw e;
    }
  }
}

module.exports = new RetrievalService();
