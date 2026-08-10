describe('ragConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load default values when env vars are unset', () => {
    delete process.env.RAG_EMBEDDING_MODEL;
    delete process.env.RAG_EMBEDDING_DIMENSIONS;
    delete process.env.RAG_CHUNK_TOKEN_SIZE;
    delete process.env.RAG_CHUNK_TOKEN_OVERLAP;
    delete process.env.RAG_RRF_K;
    delete process.env.RAG_AUTO_REPLY_CONFIDENCE_THRESHOLD;
    delete process.env.RAG_DRAFT_REVIEW_CONFIDENCE_THRESHOLD;
    delete process.env.RAG_CONTEXT_TOKEN_BUDGET;

    const config = require('../../src/config/ragConfig');

    expect(config.embeddingModel).toBe('text-embedding-3-small');
    expect(config.embeddingDimensions).toBe(1536);
    expect(config.chunkTokenSize).toBe(250);
    expect(config.chunkTokenOverlap).toBe(50);
    expect(config.rrfK).toBe(60);
    expect(config.autoReplyConfidenceThreshold).toBe(0.90);
    expect(config.draftReviewConfidenceThreshold).toBe(0.60);
    expect(config.contextTokenBudget).toBe(3000);
  });

  it('should correctly parse overridden env variables', () => {
    process.env.RAG_EMBEDDING_MODEL = 'test-model-large';
    process.env.RAG_EMBEDDING_DIMENSIONS = '2048';
    process.env.RAG_CHUNK_TOKEN_SIZE = '500';
    process.env.RAG_CHUNK_TOKEN_OVERLAP = '100';
    process.env.RAG_RRF_K = '45';
    process.env.RAG_AUTO_REPLY_CONFIDENCE_THRESHOLD = '0.95';
    process.env.RAG_DRAFT_REVIEW_CONFIDENCE_THRESHOLD = '0.70';
    process.env.RAG_CONTEXT_TOKEN_BUDGET = '5000';

    const config = require('../../src/config/ragConfig');

    expect(config.embeddingModel).toBe('test-model-large');
    expect(config.embeddingDimensions).toBe(2048);
    expect(config.chunkTokenSize).toBe(500);
    expect(config.chunkTokenOverlap).toBe(100);
    expect(config.rrfK).toBe(45);
    expect(config.autoReplyConfidenceThreshold).toBe(0.95);
    expect(config.draftReviewConfidenceThreshold).toBe(0.70);
    expect(config.contextTokenBudget).toBe(5000);
  });
});
