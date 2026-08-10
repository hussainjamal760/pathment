const chunkingService = require('../../src/services/chunkingService');
const ragConfig = require('../../src/config/ragConfig');

describe('ChunkingService', () => {
  it('should return empty array for empty or invalid text', () => {
    expect(chunkingService.chunkText('')).toEqual([]);
    expect(chunkingService.chunkText(null)).toEqual([]);
    expect(chunkingService.chunkText(123)).toEqual([]);
  });

  it('should chunk short text into a single chunk', () => {
    const text = 'This is a very short text.';
    const chunks = chunkingService.chunkText(text);
    
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].text).toBe(text);
  });

  it('should split long text into overlapping chunks', () => {
    // Generate 300 words
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    
    // We override config parameters for deterministic test sizes.
    // 52 tokens ≈ 40 words, overlap 13 tokens ≈ 10 words
    const options = { tokenSize: 52, overlap: 13 };
    const chunks = chunkingService.chunkText(text, options);
    
    expect(chunks.length).toBeGreaterThan(1);
    
    // Check first chunk
    const firstChunkWords = chunks[0].text.split(' ');
    expect(firstChunkWords).toHaveLength(40);
    expect(chunks[0].chunkIndex).toBe(0);

    // Check overlap on second chunk
    const secondChunkWords = chunks[1].text.split(' ');
    expect(secondChunkWords).toHaveLength(40);
    expect(chunks[1].chunkIndex).toBe(1);

    // Ensure overlap: The last 10 words of chunk 1 should be the first 10 words of chunk 2
    const lastWordsOfFirst = firstChunkWords.slice(-10);
    const firstWordsOfSecond = secondChunkWords.slice(0, 10);
    expect(lastWordsOfFirst).toEqual(firstWordsOfSecond);
  });
});
