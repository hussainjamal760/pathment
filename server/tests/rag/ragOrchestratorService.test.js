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

describe('RAG Orchestrator Service', () => {
  let mockMessage;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMessage = {
      id: 'msg-123',
      content: 'How do I pass my mid-term?',
      sender_id: 'user-mentee',
      recipient_id: 'user-mentor',
      conversation_id: 'conv-1',
      conversation: {
        program_id: 'prog-1',
        participants: [
          { user: { id: 'user-mentor', role: 'mentor' } },
          { user: { id: 'user-mentee', role: 'mentee' } }
        ]
      }
    };

    // Mock DB functions
    models.Message = {
      findByPk: jest.fn().mockResolvedValue(mockMessage),
      create: jest.fn().mockResolvedValue(true)
    };
    models.MentorStyleProfile = {
      findOne: jest.fn().mockResolvedValue({ toJSON: () => ({ tone: 'friendly' }) })
    };
    models.MessageDraft = {
      create: jest.fn().mockResolvedValue(true)
    };

    // Default mocks
    retrievalService.retrieveContext.mockResolvedValue([
      { visibility: 'program', content: 'Study hard and review past papers.' }
    ]);
    
    groqService.generateText.mockResolvedValue('You should review past papers! [CONFIDENCE: 0.95]');
    
    // We mock checkGrounding and computeFinalConfidence to explicitly force tiers
    groundingService.checkGrounding.mockResolvedValue({ groundingScore: 0.95, unsupportedClaims: [] });
    groundingService.computeFinalConfidence.mockReturnValue({ finalConfidence: 0.95, tier: 'auto-reply' });

    // Spy on internal handlers to verify branching
    jest.spyOn(ragOrchestratorService, '_handleAutoReply').mockResolvedValue(true);
    jest.spyOn(ragOrchestratorService, '_handleDraftReview').mockResolvedValue(true);
    jest.spyOn(ragOrchestratorService, '_handleAbstain').mockResolvedValue(true);
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

      const result = await ragOrchestratorService.queueReplyGeneration('msg-123');

      expect(result.tier).toBe('auto-reply');
      expect(ragOrchestratorService._handleAutoReply).toHaveBeenCalledTimes(1);
      expect(ragOrchestratorService._handleDraftReview).not.toHaveBeenCalled();
      expect(ragOrchestratorService._handleAbstain).not.toHaveBeenCalled();
    });

    it('should route to DRAFT-REVIEW when confidence is marginal', async () => {
      groundingService.computeFinalConfidence.mockReturnValue({ finalConfidence: 0.70, tier: 'review' });

      const result = await ragOrchestratorService.queueReplyGeneration('msg-123');

      expect(result.tier).toBe('review');
      expect(ragOrchestratorService._handleAutoReply).not.toHaveBeenCalled();
      expect(ragOrchestratorService._handleDraftReview).toHaveBeenCalledTimes(1);
      expect(ragOrchestratorService._handleAbstain).not.toHaveBeenCalled();
    });

    it('should route to ABSTAIN when confidence or grounding is poor', async () => {
      groundingService.computeFinalConfidence.mockReturnValue({ finalConfidence: 0.30, tier: 'abstain' });

      const result = await ragOrchestratorService.queueReplyGeneration('msg-123');

      expect(result.tier).toBe('abstain');
      expect(ragOrchestratorService._handleAutoReply).not.toHaveBeenCalled();
      expect(ragOrchestratorService._handleDraftReview).not.toHaveBeenCalled();
      expect(ragOrchestratorService._handleAbstain).toHaveBeenCalledTimes(1);
    });

    it('should safely fallback to abstain if grounding check throws an error', async () => {
      // Mock LLM generation success
      groqService.generateText.mockResolvedValueOnce('Draft [CONFIDENCE: 0.95]');
      
      // Mock grounding failure
      groundingService.checkGrounding.mockRejectedValueOnce(new Error('Grounding service timeout'));

      const result = await ragOrchestratorService.queueReplyGeneration('msg-123');

      // Should gracefully fallback to abstain, finalConfidence = 0
      expect(result.tier).toBe('abstain');
      expect(result.finalConfidence).toBe(0);

      // Verify it handles abstain correctly with the error fields
      expect(ragOrchestratorService._handleAbstain).toHaveBeenCalledWith(
        expect.anything(),
        0,
        [],
        'Draft',
        'Grounding service timeout'
      );
    });
  });
});
