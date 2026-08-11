const ragIngestionService = require('../../src/services/ragIngestionService');
const chunkingService = require('../../src/services/chunkingService');
const { sequelize } = require('../../src/db');

// Mock dependencies
jest.mock('../../src/db', () => ({
  sequelize: {
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT' }
  }
}));

jest.mock('../../src/services/chunkingService', () => ({
  chunkText: jest.fn()
}));

jest.mock('../../src/services/embeddingService', () => ({
  embedChunks: jest.fn()
}));

describe('Document Deletion Race Condition (P17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('worker should skip ingestion and cancel job if document was deleted before processing', async () => {
    // Mock the docExists query to return empty (simulating the document being deleted)
    sequelize.query.mockImplementation(async (query, options) => {
      if (query.includes('SELECT 1 FROM mentor_documents')) {
        return []; // No rows found
      }
      if (query.includes('UPDATE rag_ingestion_jobs SET status = \'cancelled\'')) {
        return [1];
      }
      return [];
    });

    const job = {
      id: 'job_123',
      source_type: 'mentor_document',
      source_id: 'doc_456',
      text: 'Some extracted text'
    };

    const result = await ragIngestionService.processJob(job);

    // 1. Assert result is unsuccessful due to deletion
    expect(result).toEqual({ success: false, reason: 'document_deleted' });

    // 2. Assert that the worker cancelled the job
    const cancelQueryCall = sequelize.query.mock.calls.find(call => call[0].includes('UPDATE rag_ingestion_jobs SET status = \'cancelled\''));
    expect(cancelQueryCall).toBeDefined();
    expect(cancelQueryCall[1].replacements).toEqual({ id: 'job_123' });

    // 3. Assert NO chunks were processed or inserted (second line of defense worked!)
    expect(chunkingService.chunkText).not.toHaveBeenCalled();
  });
});
