const { models } = require('../../src/db');
const ragOrchestratorService = require('../../src/services/ragOrchestratorService');
const retrievalService = require('../../src/services/retrievalService');
const groqService = require('../../src/services/groqService');
const groundingService = require('../../src/services/groundingService');
const promptBuilderService = require('../../src/services/promptBuilderService');

// Mock external services to control the test tiers
jest.mock('../../src/services/retrievalService');
jest.mock('../../src/services/groqService', () => ({
  generateText: jest.fn()
}));
jest.mock('../../src/services/groundingService');
jest.mock('../../src/db', () => ({
  models: {
    MentorStyleProfile: {
      findOne: jest.fn()
    }
  },
  sequelize: {}
}));

describe('RAG Orchestrator Service', () => {
  let mockMessage;
  let mockContext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMessage = {
      id: 'msg-123',
      messageText: 'How do I pass my mid-term?',
      senderId: 'user-mentee',
      recipientId: 'user-mentor',
      threadId: 'conv-1'
    };

    mockContext = {
      query: 'How do I pass my mid-term?',
      mentorId: 'user-mentor',
      menteeId: 'user-mentee',
      programId: 'prog-1',
      conversationId: 'conv-1'
    };

    models.MentorStyleProfile.findOne.mockResolvedValue({ toJSON: () => ({ tone: 'friendly' }) });

    // Default mocks
    retrievalService.retrieveContext.mockResolvedValue([
      { id: 'chunk-1', visibility: 'program', content: 'Study hard and review past papers.' }
    ]);
    
    groqService.generateText.mockResolvedValue('You should review past papers! [CONFIDENCE: 0.95]');
    
    // We mock checkGrounding and computeFinalConfidence to explicitly force tiers
    groundingService.checkGrounding.mockResolvedValue({ groundingScore: 0.95, unsupportedClaims: [] });
    groundingService.computeFinalConfidence.mockReturnValue({ finalConfidence: 0.95, tier: 'auto-reply' });
  });

  describe('Prompt Builder Integration', () => {
    it('should build prompt respecting token budget and trust levels', () => {
      // Simulate level contexts: 1 is highest priority, 5 is lowest
      const levelContexts = [
        { level: 5, content: 'Low priority public context.' },
        { level: 1, content: 'High priority mentor context.' }
      ];

      // With an extremely tiny budget to force truncation of the low priority item
      // We will override internal budget calculation slightly for testing, or just rely on standard budget
      const result = promptBuilderService._assembleContext(levelContexts, 5); // budget of 5 tokens

      // The high priority (level 1) should be included (even if it slightly exceeds budget because we guarantee at least 1)
      // The low priority (level 5) should be trimmed.
      expect(result).toContain('High priority mentor context');
      expect(result).not.toContain('Low priority public context');
    });
  });

  describe('Orchestration Branching', () => {
    it('should route to AUTO-REPLY when confidence and grounding are high', async () => {
      groundingService.computeFinalConfidence.mockReturnValue({ finalConfidence: 0.95, tier: 'auto-reply' });

      const result = await ragOrchestratorService.generateDecision(mockContext);

      expect(result.tier).toBe('auto-reply');
      expect(result.confidence).toBe(0.95);
      expect(result.chunkIds).toEqual(['chunk-1']);
    });

    it('should route to DRAFT-REVIEW when confidence is marginal', async () => {
      groundingService.computeFinalConfidence.mockReturnValue({ finalConfidence: 0.70, tier: 'review' });

      const result = await ragOrchestratorService.generateDecision(mockContext);

      expect(result.tier).toBe('review');
      expect(result.confidence).toBe(0.70);
      expect(result.chunkIds).toEqual(['chunk-1']);
    });

    it('should route to ABSTAIN when confidence or grounding is poor', async () => {
      groundingService.computeFinalConfidence.mockReturnValue({ finalConfidence: 0.30, tier: 'abstain' });

      const result = await ragOrchestratorService.generateDecision(mockContext);

      expect(result.tier).toBe('abstain');
      expect(result.confidence).toBe(0.30);
    });

    it('should safely fallback to abstain if grounding check throws an error', async () => {
      // Mock LLM generation success
      groqService.generateText.mockResolvedValueOnce('Draft [CONFIDENCE: 0.95]');
      
      // Mock grounding failure
      groundingService.checkGrounding.mockRejectedValueOnce(new Error('Grounding service timeout'));

      const result = await ragOrchestratorService.generateDecision(mockContext);

      // Should gracefully fallback to abstain, finalConfidence = 0
      expect(result.tier).toBe('abstain');
      expect(result.confidence).toBe(0);
      expect(result.groundingCheckError).toBe('Grounding service timeout');
    });
  });
});
