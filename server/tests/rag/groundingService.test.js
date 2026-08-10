const groundingService = require('../../src/services/groundingService');
const ragConfig = require('../../src/config/ragConfig');
const groqService = require('../../src/services/groqService');

// Mock the groqService to avoid actual LLM calls during tests
jest.mock('../../src/services/groqService', () => ({
  generateText: jest.fn()
}));
describe('Grounding Check & Confidence Scoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default threshold configs if not loaded
    ragConfig.autoReplyConfidenceThreshold = 0.90;
    ragConfig.draftReviewConfidenceThreshold = 0.60;
    ragConfig.groundingCombinationStrategy = 'min';
  });

  describe('checkGrounding', () => {
    it('should return 1.0 score when draft is completely empty', async () => {
      const result = await groundingService.checkGrounding({ draftText: '', retrievedChunks: [] });
      expect(result.groundingScore).toBe(1.0);
      expect(result.unsupportedClaims).toHaveLength(0);
    });

    it('should correctly parse LLM JSON verification output', async () => {
      groqService.generateText.mockResolvedValueOnce(JSON.stringify({
        groundingScore: 0.8,
        unsupportedClaims: ['The program starts on Monday.']
      }));

      const result = await groundingService.checkGrounding({ 
        draftText: 'Hello! The program starts on Monday.', 
        retrievedChunks: [{ content: 'Program details: TBD.' }] 
      });

      expect(groqService.generateText).toHaveBeenCalledTimes(1);
      expect(result.groundingScore).toBe(0.8);
      expect(result.unsupportedClaims).toContain('The program starts on Monday.');
    });

    it('should handle LLM returning invalid JSON gracefully', async () => {
      groqService.generateText.mockResolvedValueOnce('I am sorry, I cannot fulfill this request.');

      const result = await groundingService.checkGrounding({ 
        draftText: 'Some claim.', 
        retrievedChunks: [] 
      });

      expect(result.groundingScore).toBe(0.0);
      expect(result.unsupportedClaims[0]).toMatch(/failed to execute/);
    });
  });

  describe('computeFinalConfidence', () => {
    it('should return auto-reply if both LLM and Grounding scores are above threshold', () => {
      const result = groundingService.computeFinalConfidence({
        llmConfidence: 0.95,
        groundingScore: 0.92
      });
      expect(result.finalConfidence).toBe(0.92); // Min strategy
      expect(result.tier).toBe('auto-reply');
    });

    it('should DOWNGRADE a high LLM confidence if grounding score is poor (Hallucination catch)', () => {
      const result = groundingService.computeFinalConfidence({
        llmConfidence: 0.98, // Extremely confident LLM
        groundingScore: 0.40 // But it hallucinated completely
      });
      
      expect(result.finalConfidence).toBe(0.40);
      expect(result.tier).toBe('abstain'); // 0.40 is below 0.60 draftReview threshold
    });

    it('should drop into review tier for marginal grounding', () => {
      const result = groundingService.computeFinalConfidence({
        llmConfidence: 0.90, 
        groundingScore: 0.70 
      });
      
      expect(result.finalConfidence).toBe(0.70);
      expect(result.tier).toBe('review');
    });

    it('should respect alternative combination strategies if configured', () => {
      ragConfig.groundingCombinationStrategy = 'average';
      const result = groundingService.computeFinalConfidence({
        llmConfidence: 0.90,
        groundingScore: 0.70
      });
      // Average of 0.9 and 0.7 is 0.8
      expect(result.finalConfidence).toBe(0.80);
      expect(result.tier).toBe('review');
    });
  });
});
