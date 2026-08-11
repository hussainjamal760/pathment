const { Sequelize } = require('sequelize');
const { sequelize } = require('../../src/db');
const retrievalService = require('../../src/services/retrievalService');

// Mock sequelize query to intercept vectorQuery and check if it over-fetches
jest.mock('../../src/db', () => {
  const original = jest.requireActual('../../src/db');
  return {
    ...original,
    sequelize: {
      ...original.sequelize,
      query: jest.fn(),
      QueryTypes: { SELECT: 'SELECT' }
    }
  };
});

describe('HNSW Post-Filtering Starvation Mitigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.query.mockResolvedValue([]);
  });

  it('should over-fetch candidates from the index (LIMIT 150) before trimming to LIMIT 50', async () => {
    // Setup dummy embedding provider
    const mockEmbed = jest.fn().mockResolvedValue([{ embedding: new Array(1536).fill(0) }]);
    const embeddingService = require('../../src/services/embeddingService');
    embeddingService.embedChunks = mockEmbed;

    await retrievalService.retrieveContext({ query: 'test query', programId: 'prog1', mentorId: 'mentor1', unlockedRoadmapNodeIds: ['rd1'] });

    const queries = sequelize.query.mock.calls;
    
    // Find the vector query
    const vectorCall = queries.find(call => typeof call[0] === 'string' && call[0].includes('embedding <=>'));
    expect(vectorCall).toBeDefined();

    const sql = vectorCall[0];
    // Check if the inner limit is present and is greater than outer limit
    expect(sql).toMatch(/LIMIT 150/); // Inner over-fetch
    expect(sql).toMatch(/LIMIT 50/);  // Outer trim
  });
});
