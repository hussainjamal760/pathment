const ragOrchestratorService = require('../../src/services/ragOrchestratorService');
const { models } = require('../../src/db');

// Mock DB
jest.mock('../../src/db', () => ({
  models: {
    MessageDraft: {
      create: jest.fn()
    }
  }
}));

describe('Draft Evidence Persistence (P20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should persist groundingScore, retrievedChunkIds, and unsupportedSpans in MessageDraft', async () => {
    const originalMessage = {
      id: 'msg_123',
      threadId: 'thread_123',
      senderId: 'mentee_123',
      recipientId: 'mentor_123',
      messageText: 'Hello'
    };
    
    models.MessageDraft.create.mockResolvedValue({ id: 'draft_123' });

    const retrievedChunks = [
      { id: 'chunk_1', text: 'evidence 1' },
      { id: 'chunk_2', text: 'evidence 2' }
    ];
    
    const unsupportedClaims = ['unsupported claim 1'];
    
    await ragOrchestratorService._handleDraftReview(
      originalMessage, 
      'draft text response', 
      0.9, 
      0.85, 
      retrievedChunks, 
      unsupportedClaims
    );

    expect(models.MessageDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'msg_123',
        draftContent: 'draft text response',
        confidenceScore: 0.9,
        groundingScore: 0.85,
        retrievedChunkIds: ['chunk_1', 'chunk_2'],
        unsupportedSpans: ['unsupported claim 1']
      })
    );
  });
});
