// We want to test the RRF math precisely, so we'll mock the database queries
const retrievalService = require('../../src/services/retrievalService');
const embeddingService = require('../../src/services/embeddingService');
const { sequelize } = require('../../src/db');
const ragConfig = require('../../src/config/ragConfig');

jest.mock('../../src/services/embeddingService', () => ({
  embedChunks: jest.fn()
}));

describe('RRF Fusion Algorithm', () => {
  let originalRrfK, originalTokenBudget;

  beforeAll(() => {
    // Store original config
    originalRrfK = ragConfig.rrfK;
    originalTokenBudget = ragConfig.contextTokenBudget;
    
    // Override for precise math tests
    ragConfig.rrfK = 60;
    ragConfig.contextTokenBudget = 5000;
  });

  afterAll(() => {
    // Restore config
    ragConfig.rrfK = originalRrfK;
    ragConfig.contextTokenBudget = originalTokenBudget;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should correctly fuse and order results using RRF mathematical formula', async () => {
    // Mock the query embedding so it doesn't fail
    embeddingService.embedChunks.mockResolvedValue([
      { embedding: Array(1536).fill(0.1) }
    ]);

    // Hand-computed fixture inputs:
    // chunk_A: vector rank 1, FTS rank 3
    // chunk_B: vector rank 2, FTS rank 1
    // chunk_C: vector rank 4, FTS rank 2
    
    const vectorResults = [
      { id: 'chunk_A', content: 'A' }, // rank 1
      { id: 'chunk_B', content: 'B' }, // rank 2
      { id: 'chunk_miss', content: 'M' }, // rank 3
      { id: 'chunk_C', content: 'C' }, // rank 4
    ];

    const ftsResults = [
      { id: 'chunk_B', content: 'B', rank: 0.9 }, // rank 1
      { id: 'chunk_C', content: 'C', rank: 0.5 }, // rank 2
      { id: 'chunk_A', content: 'A', rank: 0.1 }, // rank 3
    ];

    // Mock sequelize.query to return these specific arrays
    // retrievalService uses Promise.all([vectorQuery, ftsQuery])
    // The first call returns vector, second returns fts.
    jest.spyOn(sequelize, 'query')
      .mockResolvedValueOnce(vectorResults)
      .mockResolvedValueOnce(ftsResults);

    const result = await retrievalService.retrieveContext({ query: 'test rrf' });

    // Mathematical verification (k = 60):
    // chunk_A score = 1/(60+1) + 1/(60+3) = (1/61) + (1/63) = 0.01639 + 0.01587 = 0.03226
    // chunk_B score = 1/(60+2) + 1/(60+1) = (1/62) + (1/61) = 0.01612 + 0.01639 = 0.03251
    // chunk_C score = 1/(60+4) + 1/(60+2) = (1/64) + (1/62) = 0.01562 + 0.01612 = 0.03174
    // chunk_miss score = 1/(60+3) = 1/63 = 0.01587
    
    // Expected sorting order (Descending): chunk_B, chunk_A, chunk_C, chunk_miss
    
    expect(result).toHaveLength(4);
    expect(result[0].id).toBe('chunk_B'); // Highest score
    expect(result[1].id).toBe('chunk_A');
    expect(result[2].id).toBe('chunk_C');
    expect(result[3].id).toBe('chunk_miss');
  });

  it('should trim results that exceed the context token budget', async () => {
    embeddingService.embedChunks.mockResolvedValue([
      { embedding: Array(1536).fill(0.1) }
    ]);

    // Force a tight token budget
    ragConfig.contextTokenBudget = 10; 

    // We estimate words * 1.3 = tokens.
    // "One two three four" = 4 words = ceil(5.2) = 6 tokens.
    // "Five six seven" = 3 words = ceil(3.9) = 4 tokens.
    // Total = 10 tokens.
    // "Eight nine ten" = 3 words = 4 tokens. Adding this would be 14 tokens (>10).

    const vectorResults = [
      { id: '1', content: 'One two three four' }, // 6 tokens
      { id: '2', content: 'Five six seven' },     // 4 tokens
      { id: '3', content: 'Eight nine ten' }      // 4 tokens
    ];

    jest.spyOn(sequelize, 'query')
      .mockResolvedValueOnce(vectorResults)
      .mockResolvedValueOnce([]); // No FTS results

    const result = await retrievalService.retrieveContext({ query: 'budget' });

    // Should return exactly the first two because adding the third exceeds 10 tokens.
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('2');
  });
});
