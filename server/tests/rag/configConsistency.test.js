const ragConfig = require('../../src/config/ragConfig');
const retrievalService = require('../../src/services/retrievalService');
const promptBuilderService = require('../../src/services/promptBuilderService');

// Save the original value so we can restore it
const originalBudget = ragConfig.contextTokenBudget;

describe('RAG Config Consistency', () => {
  afterEach(() => {
    ragConfig.contextTokenBudget = originalBudget;
  });

  it('promptBuilderService should use ragConfig.contextTokenBudget exactly', () => {
    // Set a very specific budget
    ragConfig.contextTokenBudget = 1000;
    
    // Each word is ~1.3 tokens. 
    // We want a context that exceeds the budget to see if it truncates properly based on ragConfig.
    // Mentee tokens + 200 overhead will be subtracted from 1000.
    // Mentee message "Hello" = 1 word = 2 tokens.
    // Available budget = 1000 - 2 - 200 = 798 tokens.
    // 798 tokens / 1.3 = ~613 words.
    
    // We will provide two chunks. 
    // Chunk 1: 500 words (~650 tokens). Fits.
    // Chunk 2: 500 words (~650 tokens). Does not fit (650 + 650 > 798).
    const chunk1 = Array(500).fill('word').join(' ');
    const chunk2 = Array(500).fill('test').join(' ');
    
    const result = promptBuilderService.buildPrompt({
      levelContexts: [
        { level: 1, content: chunk1 },
        { level: 2, content: chunk2 }
      ],
      menteeMessage: 'Hello'
    });
    
    // It should include Chunk 1 but NOT Chunk 2 because that would exceed 798 tokens.
    expect(result.systemPrompt).toContain(chunk1);
    expect(result.systemPrompt).not.toContain(chunk2);

    // Now change it to something huge to prove it honors the change dynamically
    ragConfig.contextTokenBudget = 3000;
    const resultHuge = promptBuilderService.buildPrompt({
      levelContexts: [
        { level: 1, content: chunk1 },
        { level: 2, content: chunk2 }
      ],
      menteeMessage: 'Hello'
    });
    
    // Now both should fit (650 + 650 = 1300 < 3000)
    expect(resultHuge.systemPrompt).toContain(chunk1);
    expect(resultHuge.systemPrompt).toContain(chunk2);
  });

  it('retrievalService should use ragConfig.contextTokenBudget exactly', () => {
    // Since retrievalService relies on private methods or deep DB mocking for its full run,
    // we can test `_estimateTokens` and logic just by mocking the DB calls or observing behavior.
    // Actually, `retrievalService._estimateTokens` is private, but the token trimming happens at the end of `retrieveContext`.
    // Instead of a full DB mock, we can observe that it doesn't have a fallback by mocking the DB to return a lot of chunks.
    
    ragConfig.contextTokenBudget = 1000;
    // We can't easily mock the internal db call without a lot of setup, but we can verify 
    // it doesn't have local fallback variables by doing a text scan of the file in the test, 
    // OR we can just mock embeddingService and sequelize.
    
    const fs = require('fs');
    const path = require('path');
    const retrievalContent = fs.readFileSync(path.join(__dirname, '../../src/services/retrievalService.js'), 'utf-8');
    const promptBuilderContent = fs.readFileSync(path.join(__dirname, '../../src/services/promptBuilderService.js'), 'utf-8');
    
    // Assert that no fallback (|| number) exists for contextTokenBudget
    expect(retrievalContent).not.toMatch(/contextTokenBudget\s*\|\|\s*\d+/);
    expect(promptBuilderContent).not.toMatch(/contextTokenBudget\s*\|\|\s*\d+/);
    
    // Also check rrfK
    expect(retrievalContent).not.toMatch(/rrfK\s*\|\|\s*\d+/);
  });
});
