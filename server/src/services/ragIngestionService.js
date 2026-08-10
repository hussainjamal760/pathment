const { models, sequelize } = require('../db');
const chunkingService = require('./chunkingService');
const embeddingService = require('./embeddingService');
const logger = require('../utils/ragLogger');

class RagIngestionService {
  /**
   * Enqueue a text payload to be chunked and embedded by the async worker.
   */
  async enqueueIngestion({ sourceType, sourceId, text, mentorId = null, programId = null, visibility = 'public' }) {
    if (!text || !sourceType || !sourceId) {
      return { queued: false, reason: 'invalid_payload' };
    }

    try {
      const job = await sequelize.query(`
        INSERT INTO rag_ingestion_jobs 
        (id, source_type, source_id, text, mentor_id, program_id, visibility, status, max_attempts, created_at, updated_at)
        VALUES (gen_random_uuid(), :sourceType, :sourceId, :text, :mentorId, :programId, :visibility, 'pending', 3, NOW(), NOW())
        RETURNING id
      `, {
        replacements: { sourceType, sourceId, text, mentorId, programId, visibility },
        type: sequelize.QueryTypes.INSERT
      });
      
      logger.info('rag_job_enqueued', { jobId: job[0][0].id, sourceType, sourceId });
      return { queued: true, jobId: job[0][0].id };
    } catch (e) {
      logger.error('rag_job_enqueue_failed', { error: e.message, sourceType, sourceId });
      throw e;
    }
  }

  /**
   * Exponential backoff for retries.
   */
  backoffMs(attempt) {
    return Math.pow(2, attempt) * 60000; // 1m, 2m, 4m...
  }

  /**
   * Process a single queued ingestion job.
   */
  async processJob(job) {
    const attemptCount = (job.attempt_count || 0) + 1;
    logger.info('rag_job_started', { jobId: job.id, attempt: attemptCount });

    try {
      // 1. Chunk Text
      const chunks = chunkingService.chunkText(job.text);
      if (!chunks.length) {
        // Nothing to embed
        await sequelize.query(`UPDATE rag_ingestion_jobs SET status = 'completed', updated_at = NOW() WHERE id = :id`, {
          replacements: { id: job.id }
        });
        return { success: true, chunksProcessed: 0 };
      }

      // 2. Hash & Embed (Skips API if hash exists)
      const enrichedChunks = await embeddingService.embedChunks(chunks, job.mentor_id);

      // 3. Upsert into KnowledgeChunks
      // We use INSERT ... ON CONFLICT DO UPDATE (or DO NOTHING) to safely handle duplicates.
      // We'll insert one by one or in batch. Sequelize allows bulkCreate with updateOnDuplicate.
      
      const recordsToUpsert = enrichedChunks.map(c => ({
        source_type: job.source_type,
        source_id: job.source_id,
        source_version: 1, // Basic versioning for now
        chunk_index: c.chunkIndex,
        content_hash: c.contentHash,
        content: c.text,
        embedding: c.skipped ? undefined : c.embedding ? `[${c.embedding.join(',')}]` : null, // format for pgvector if not skipped
        mentor_id: job.mentor_id,
        program_id: job.program_id,
        visibility: job.visibility
      }));

      // In Sequelize, raw vector strings like '[0.1, 0.2]' are parsed safely via literal or just raw string insertion
      // We will do raw SQL upserts to cleanly handle the vector casting.
      
      for (const record of recordsToUpsert) {
        // If it was skipped, it means we don't need to update the embedding, but we might want to update 
        // the visibility/scopes if they changed (or we just DO NOTHING since chunk_index+contentHash matched).
        // Safest is DO NOTHING since content_hash uniquely identifies the chunk text for this source.
        
        let query = `
          INSERT INTO knowledge_chunks 
          (id, source_type, source_id, source_version, chunk_index, content_hash, content, embedding, mentor_id, program_id, visibility, created_at, updated_at)
          VALUES (gen_random_uuid(), :source_type, :source_id, :source_version, :chunk_index, :content_hash, :content, :embedding, :mentor_id, :program_id, :visibility, NOW(), NOW())
          ON CONFLICT (source_type, source_id, chunk_index, content_hash) DO NOTHING
        `;
        
        const replacements = { ...record };
        if (record.embedding) {
          // pgvector implicitly casts string '[1,2,3]' to vector when we append ::vector
          // No need for sequelize.fn in raw query replacements.
          query = `
            INSERT INTO knowledge_chunks 
            (id, source_type, source_id, source_version, chunk_index, content_hash, content, embedding, mentor_id, program_id, visibility, created_at, updated_at)
            VALUES (gen_random_uuid(), :source_type, :source_id, :source_version, :chunk_index, :content_hash, :content, :embedding::vector, :mentor_id, :program_id, :visibility, NOW(), NOW())
            ON CONFLICT (source_type, source_id, chunk_index, content_hash) DO NOTHING
          `;
        } else {
          // If embedding is undefined/null (because it was skipped), we just insert null (or we know DO NOTHING will hit anyway)
          query = `
            INSERT INTO knowledge_chunks 
            (id, source_type, source_id, source_version, chunk_index, content_hash, content, mentor_id, program_id, visibility, created_at, updated_at)
            VALUES (gen_random_uuid(), :source_type, :source_id, :source_version, :chunk_index, :content_hash, :content, :mentor_id, :program_id, :visibility, NOW(), NOW())
            ON CONFLICT (source_type, source_id, chunk_index, content_hash) DO NOTHING
          `;
        }
        
        await sequelize.query(query, { replacements });
      }

      // Mark Job Completed
      await sequelize.query(`
        UPDATE rag_ingestion_jobs SET status = 'completed', updated_at = NOW() WHERE id = :id
      `, { replacements: { id: job.id } });

      logger.info('rag_job_completed', { jobId: job.id, chunksProcessed: enrichedChunks.length });
      return { success: true, chunksProcessed: enrichedChunks.length };

    } catch (e) {
      const isDead = attemptCount >= (job.max_attempts || 3);
      const nextAttemptAt = isDead ? null : new Date(Date.now() + this.backoffMs(attemptCount));
      const status = isDead ? 'dead' : 'pending';
      const lastError = String(e.message || 'unknown_error').slice(0, 500);
      
      await sequelize.query(`
        UPDATE rag_ingestion_jobs 
        SET status = :status, attempt_count = :attemptCount, last_error = :lastError, next_attempt_at = :nextAttemptAt, updated_at = NOW()
        WHERE id = :id
      `, {
        replacements: { status, attemptCount, lastError, nextAttemptAt, id: job.id }
      });
      
      logger.error('rag_job_failed', { jobId: job.id, attempt: attemptCount, isDead, error: e.message });
      return { success: false, isDead };
    }
  }

  /**
   * Reset rows wedged in 'processing' (e.g. worker crash).
   */
  async reapStuck() {
    await sequelize.query(`
      UPDATE rag_ingestion_jobs SET status='pending', next_attempt_at=NOW(), updated_at=NOW()
      WHERE status='processing' AND last_attempt_at < NOW() - INTERVAL '15 minutes'
    `);
  }

  /**
   * Atomic claim of due jobs using FOR UPDATE SKIP LOCKED.
   */
  async claimDue(batchSize = 10) {
    const [rows] = await sequelize.query(`
      UPDATE rag_ingestion_jobs SET status='processing', last_attempt_at=NOW(), updated_at=NOW()
      WHERE id IN (
        SELECT id FROM rag_ingestion_jobs
        WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ORDER BY created_at ASC
        LIMIT :batch
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `, { replacements: { batch: batchSize } });
    return rows || [];
  }

  /**
   * Process a batch of jobs (used by worker tick).
   */
  async processBatch(batchSize = 10) {
    await this.reapStuck();
    const rows = await this.claimDue(batchSize);
    let completed = 0, failed = 0, dead = 0;
    
    for (const job of rows) {
      const result = await this.processJob(job);
      if (result.success) completed++;
      else if (result.isDead) dead++;
      else failed++;
    }
    
    return { claimed: rows.length, completed, failed, dead };
  }
}

module.exports = new RagIngestionService();
