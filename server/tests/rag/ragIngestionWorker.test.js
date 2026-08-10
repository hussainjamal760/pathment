const { sequelize, models } = require('../../src/db');
const ragIngestionService = require('../../src/services/ragIngestionService');
const embeddingService = require('../../src/services/embeddingService');
const migration092 = require('../../scripts/migrations/092_rag_ingestion_jobs');
const migration091 = require('../../scripts/migrations/091_rag_core_schema');

// Mock embedding service so we don't actually hit OpenAI in integration tests
jest.mock('../../src/services/embeddingService', () => ({
  embedChunks: jest.fn(),
  computeContentHash: jest.fn(text => require('crypto').createHash('sha256').update(text).digest('hex'))
}));

describe('ragIngestionService', () => {
  beforeAll(async () => {
    // Run migrations on the test database
    await migration091.up();
    await migration092.up();
  });

  afterAll(async () => {
    await migration092.down();
    await migration091.down();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await sequelize.query('TRUNCATE TABLE rag_ingestion_jobs CASCADE');
    await sequelize.query('TRUNCATE TABLE knowledge_chunks CASCADE');
  });

  it('should successfully enqueue and process a job, inserting chunks', async () => {
    embeddingService.embedChunks.mockResolvedValue([
      { chunkIndex: 0, contentHash: 'hash1', text: 'chunk1', embedding: Array(1536).fill(0.1), skipped: false },
      { chunkIndex: 1, contentHash: 'hash2', text: 'chunk2', embedding: Array(1536).fill(0.2), skipped: false }
    ]);

    const enqueueResult = await ragIngestionService.enqueueIngestion({
      sourceType: 'document',
      sourceId: 'doc1',
      text: 'chunk1 chunk2'
    });

    expect(enqueueResult.queued).toBe(true);

    const processResult = await ragIngestionService.processBatch(10);
    
    expect(processResult.claimed).toBe(1);
    expect(processResult.completed).toBe(1);
    expect(processResult.failed).toBe(0);

    const chunks = await sequelize.query(`SELECT * FROM knowledge_chunks WHERE source_type = 'document' AND source_id = 'doc1'`, {
      type: sequelize.QueryTypes.SELECT
    });

    expect(chunks).toHaveLength(2);
    
    // Check job status
    const jobs = await sequelize.query(`SELECT status FROM rag_ingestion_jobs WHERE id = :id`, {
      replacements: { id: enqueueResult.jobId },
      type: sequelize.QueryTypes.SELECT
    });
    expect(jobs[0].status).toBe('completed');
  });

  it('should retry jobs and move them to dead on repeated failure', async () => {
    embeddingService.embedChunks.mockRejectedValue(new Error('Simulated embedding failure'));

    const enqueueResult = await ragIngestionService.enqueueIngestion({
      sourceType: 'faq',
      sourceId: 'faq1',
      text: 'some fail text'
    });

    // Speed up backoff for test logic if needed, but here we can just update the `next_attempt_at` 
    // manually to force it to be immediately due for the next batch claim.
    
    for (let i = 1; i <= 3; i++) {
      // Force next_attempt_at so it claims immediately
      await sequelize.query(`UPDATE rag_ingestion_jobs SET next_attempt_at = NOW()`);
      
      const res = await ragIngestionService.processBatch(10);
      expect(res.claimed).toBe(1);
      
      const job = (await sequelize.query(`SELECT status, attempt_count FROM rag_ingestion_jobs WHERE id = :id`, {
        replacements: { id: enqueueResult.jobId },
        type: sequelize.QueryTypes.SELECT
      }))[0];
      
      expect(job.attempt_count).toBe(i);
      
      if (i < 3) {
        expect(res.failed).toBe(1);
        expect(job.status).toBe('pending');
      } else {
        expect(res.dead).toBe(1);
        expect(job.status).toBe('dead');
      }
    }
    
    // Attempt 4 should claim 0 since it is dead
    const finalRes = await ragIngestionService.processBatch(10);
    expect(finalRes.claimed).toBe(0);
  });
});
