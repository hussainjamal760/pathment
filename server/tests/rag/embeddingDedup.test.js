const ragIngestionService = require('../../src/services/ragIngestionService');
const embeddingService = require('../../src/services/embeddingService');
const groqService = require('../../src/services/groqService');
const { models, sequelize } = require('../../src/db');

// Mock the AI client to avoid network calls
jest.mock('../../src/services/groqService', () => ({
  _resolve: jest.fn()
}));

// Mock the embedding provider adapter
jest.mock('../../src/services/embeddingProviders', () => ({
  getAdapter: jest.fn()
}));
const embeddingProviders = require('../../src/services/embeddingProviders');

// Mock Sequelize so we don't need a real DB
jest.mock('../../src/db', () => ({
  models: {
    KnowledgeChunk: {
      findAll: jest.fn()
    }
  },
  sequelize: {
    query: jest.fn().mockImplementation((q) => {
      if (typeof q === 'string' && q.includes('MAX(source_version)')) {
        return [{ max_ver: 0 }];
      }
      return [];
    }),
    QueryTypes: { INSERT: 'INSERT', SELECT: 'SELECT', UPDATE: 'UPDATE' }
  }
}));

describe('Embedding Dedup Scope', () => {
  afterEach(async () => {
    jest.clearAllMocks();
  });

  it('should correctly dedupe within a mentor but NOT across mentors, and no NULL embeddings', async () => {
    const mockCreateEmbedding = jest.fn().mockResolvedValue([Array(768).fill(0.99)]);
    embeddingProviders.getAdapter.mockReturnValue({
      embed: mockCreateEmbedding
    });

    groqService._resolve.mockResolvedValue({
      enabled: true,
      provider: 'gemini',
      client: { apiKey: 'test' }
    });

    const identicalText = 'This is exactly the same text used by both mentors.';

    // Mock KnowledgeChunk.findAll for dedup
    models.KnowledgeChunk.findAll
      .mockResolvedValueOnce([]) // Mentor A first time: no existing hashes
      .mockResolvedValueOnce([]) // Mentor B: no existing hashes for B
      .mockResolvedValueOnce([   // Mentor A second time: finds the hash!
        { content_hash: embeddingService.computeContentHash(identicalText), embedding: '[0.99,0.99]' }
      ]);

    // Process Mentor A
    await ragIngestionService.processJob({
      id: 'jobA', text: identicalText, mentor_id: 'mentorA', source_type: 'doc', source_id: 'docA', visibility: 'public', max_attempts: 1
    });

    // Process Mentor B
    await ragIngestionService.processJob({
      id: 'jobB', text: identicalText, mentor_id: 'mentorB', source_type: 'doc', source_id: 'docB', visibility: 'public', max_attempts: 1
    });

    // Process Mentor A again
    await ragIngestionService.processJob({
      id: 'jobA2', text: identicalText, mentor_id: 'mentorA', source_type: 'doc', source_id: 'docA2', visibility: 'public', max_attempts: 1
    });

    // Verify API was called EXACTLY TWICE: once for A, once for B. A2 was deduped!
    expect(mockCreateEmbedding).toHaveBeenCalledTimes(2);

    // Verify that ALL three chunks were inserted with valid embeddings (none are NULL)
    // sequelize.query is called to INSERT chunks. Let's filter those calls.
    const insertCalls = sequelize.query.mock.calls.filter(call => call[0].includes('INSERT INTO knowledge_chunks'));
    
    expect(insertCalls.length).toBe(3);
    
    for (const call of insertCalls) {
      const replacements = call[1].replacements;
      expect(replacements.embedding).not.toBeNull();
      expect(replacements.embedding).toContain('0.99'); // Should be a string like '[0.99,...]'
    }
    
    // Verify the first call was mentorA, docA
    expect(insertCalls[0][1].replacements.mentor_id).toBe('mentorA');
    expect(insertCalls[0][1].replacements.source_id).toBe('docA');

    // Verify the second call was mentorB, docB
    expect(insertCalls[1][1].replacements.mentor_id).toBe('mentorB');
    expect(insertCalls[1][1].replacements.source_id).toBe('docB');

    // Verify the third call was mentorA, docA2 (and it got the copied embedding!)
    expect(insertCalls[2][1].replacements.mentor_id).toBe('mentorA');
    expect(insertCalls[2][1].replacements.source_id).toBe('docA2');
  });
});
