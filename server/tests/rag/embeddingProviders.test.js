const GeminiAdapter = require('../../src/services/embeddingProviders/geminiAdapter');
const EmbeddingProvider = require('../../src/services/embeddingProviders/EmbeddingProvider');

// Mock global fetch
global.fetch = jest.fn();

describe('Embedding Provider Adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GeminiAdapter', () => {
    it('should extend EmbeddingProvider', () => {
      const adapter = new GeminiAdapter('fake-key');
      expect(adapter instanceof EmbeddingProvider).toBe(true);
    });

    it('should embed texts correctly without truncating or padding', async () => {
      const adapter = new GeminiAdapter('fake-key');
      const texts = ['Hello', 'World'];

      // Mock fetch responses for Gemini
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: [0.1, 0.2] } })
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: [0.3, 0.4] } })
      });

      const results = await adapter.embed(texts);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(results).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    });

    it('should throw an error on API failure with status attached', async () => {
      const adapter = new GeminiAdapter('fake-key');
      
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });

      await expect(adapter.embed(['Fail'])).rejects.toThrow('Gemini API Error: 500 Internal Server Error');
    });
  });

});
