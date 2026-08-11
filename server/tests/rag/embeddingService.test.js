const embeddingService = require('../../src/services/embeddingService');
const { models } = require('../../src/db');
const groqService = require('../../src/services/groqService');
const ragConfig = require('../../src/config/ragConfig');

jest.mock('../../src/db', () => ({
  models: {
    KnowledgeChunk: {
      findAll: jest.fn()
    }
  }
}));

jest.mock('../../src/services/groqService', () => ({
  _resolve: jest.fn()
}));

const mockEmbed = jest.fn();
jest.mock('../../src/services/embeddingProviders', () => ({
  getAdapter: jest.fn(() => ({
    embed: mockEmbed
  }))
}));

describe('EmbeddingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('embedChunks', () => {
    it('should compute valid sha256 hashes', async () => {
      // Mock db check to return nothing existing
      models.KnowledgeChunk.findAll.mockResolvedValue([]);
      
      // Mock groq resolve
      mockEmbed.mockResolvedValue([[0.1, 0.2]]);
      groqService._resolve.mockResolvedValue({
        enabled: true,
        client: { apiKey: 'fake-key' },
        provider: 'gemini',
        model: 'test-model'
      });

      const chunks = [{ text: 'hello world', chunkIndex: 0 }];
      const result = await embeddingService.embedChunks(chunks);
      
      expect(result).toHaveLength(1);
      expect(result[0].contentHash).toBeDefined();
      expect(result[0].contentHash).toHaveLength(64); // sha256 hex length
      expect(result[0].embedding).toEqual([0.1, 0.2]);
      expect(result[0].skipped).toBe(false);
    });

    it('should skip API calls for already-embedded hashes', async () => {
      const chunkText = 'this text is already embedded';
      const hash = embeddingService.computeContentHash(chunkText);
      
      // Mock DB so it says this hash already exists with an embedding
      models.KnowledgeChunk.findAll.mockResolvedValue([{ content_hash: hash, embedding: [0.1, 0.2] }]);
      
      groqService._resolve.mockResolvedValue({
        enabled: true,
        client: { apiKey: 'fake-key' },
        provider: 'gemini',
        model: 'test-model'
      });

      const chunks = [{ text: chunkText, chunkIndex: 0 }];
      const result = await embeddingService.embedChunks(chunks);
      
      // Ensure we skipped the API call entirely
      expect(mockEmbed).not.toHaveBeenCalled();
      
      expect(result[0].skipped).toBe(true);
      expect(result[0].embedding).toEqual([0.1, 0.2]);
    });

    it('should retry transient errors and eventually succeed', async () => {
      models.KnowledgeChunk.findAll.mockResolvedValue([]);
      
      // Transient error (429 Rate Limit) thrown twice, then success
      const error429 = new Error('Rate limit exceeded');
      error429.status = 429;

      mockEmbed
        .mockRejectedValueOnce(error429)
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce([[0.99]]);

      groqService._resolve.mockResolvedValue({
        enabled: true,
        client: { apiKey: 'fake-key' },
        provider: 'gemini',
        model: 'test-model'
      });

      // Speed up backoff for test
      jest.spyOn(embeddingService, '_backoffMs').mockReturnValue(5);

      const chunks = [{ text: 'retry test', chunkIndex: 0 }];
      const result = await embeddingService.embedChunks(chunks);

      expect(mockEmbed).toHaveBeenCalledTimes(3);
      expect(result[0].embedding).toEqual([0.99]);
    });

    it('should throw immediately on permanent error', async () => {
      models.KnowledgeChunk.findAll.mockResolvedValue([]);
      
      // 400 Bad Request is permanent
      const error400 = new Error('Bad Request');
      error400.status = 400;

      mockEmbed.mockRejectedValueOnce(error400);

      groqService._resolve.mockResolvedValue({
        enabled: true,
        client: { apiKey: 'fake-key' },
        provider: 'gemini',
        model: 'test-model'
      });

      const chunks = [{ text: 'permanent error', chunkIndex: 0 }];
      
      await expect(embeddingService.embedChunks(chunks))
        .rejects
        .toThrow('Embedding API failed permanently');
      
      // Should not retry
      expect(mockEmbed).toHaveBeenCalledTimes(1);
    });
  });
});
