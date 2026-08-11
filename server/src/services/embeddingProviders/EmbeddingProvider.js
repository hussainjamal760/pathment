/**
 * Base Interface for Embedding Providers
 * embed(texts: string[]) => Promise<number[][]>
 */
class EmbeddingProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  
  async embed(texts) {
    throw new Error('Not implemented');
  }
}

module.exports = EmbeddingProvider;
