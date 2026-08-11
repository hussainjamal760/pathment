const ragIngestionService = require('../../src/services/ragIngestionService');
const chunkingService = require('../../src/services/chunkingService');
const embeddingService = require('../../src/services/embeddingService');
const { sequelize } = require('../../src/db');

// Mock dependencies
jest.mock('../../src/db', () => ({
  sequelize: {
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT', INSERT: 'INSERT' }
  }
}));

jest.mock('../../src/services/chunkingService', () => ({
  chunkText: jest.fn()
}));

jest.mock('../../src/services/embeddingService', () => ({
  embedChunks: jest.fn()
}));

describe('Re-Ingestion Versioning (P19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should increment version and hard-delete old chunks on re-ingestion', async () => {
    chunkingService.chunkText.mockReturnValue(['chunk 1', 'chunk 2']);
    embeddingService.embedChunks.mockResolvedValue([
      { chunkIndex: 0, contentHash: 'hash1', text: 'chunk 1', embedding: [0.1] },
      { chunkIndex: 1, contentHash: 'hash2', text: 'chunk 2', embedding: [0.2] }
    ]);

    // Mock sequelize.query responses
    sequelize.query.mockImplementation(async (query, options) => {
      // 2nd line of defense check
      if (query.includes('SELECT 1 FROM mentor_documents')) {
        return [{ '?column?': 1 }];
      }
      
      // Max version check (Simulate version 1 exists)
      if (query.includes('MAX(source_version)')) {
        return [{ max_ver: 1 }];
      }

      return [];
    });

    const job = {
      id: 'job_123',
      source_type: 'mentor_document',
      source_id: 'doc_456',
      text: 'New revised text',
      mentor_id: 'mentor_123',
      visibility: 'public'
    };

    const result = await ragIngestionService.processJob(job);
    expect(result.success).toBe(true);
    expect(result.chunksProcessed).toBe(2);

    const calls = sequelize.query.mock.calls;

    // 1. Assert we checked the max version
    const versionQueryCall = calls.find(call => call[0].includes('MAX(source_version)'));
    expect(versionQueryCall).toBeDefined();
    expect(versionQueryCall[1].replacements).toEqual({ source_type: 'mentor_document', source_id: 'doc_456' });

    // 2. Assert we issued a DELETE for prior versions (since newVersion > 1)
    const deleteQueryCall = calls.find(call => call[0].includes('DELETE FROM knowledge_chunks'));
    expect(deleteQueryCall).toBeDefined();
    // new_version should be 2
    expect(deleteQueryCall[1].replacements).toEqual({ source_type: 'mentor_document', source_id: 'doc_456', new_version: 2 });

    // 3. Assert the UPSERT queries used source_version = 2
    const upsertQueryCalls = calls.filter(call => call[0].includes('INSERT INTO knowledge_chunks'));
    expect(upsertQueryCalls.length).toBe(2); // Two chunks
    expect(upsertQueryCalls[0][1].replacements.source_version).toBe(2);
    expect(upsertQueryCalls[1][1].replacements.source_version).toBe(2);
  });
});
