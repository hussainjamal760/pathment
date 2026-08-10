const messagingService = require('../../src/services/messagingService');
const ragOrchestratorService = require('../../src/services/ragOrchestratorService');
const { models, sequelize } = require('../../src/db');

jest.mock('../../src/services/ragOrchestratorService');
jest.mock('../../src/db');

describe('Messaging Hook for RAG Orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Sequelize transaction behavior
    sequelize.transaction.mockImplementation(async (cb) => {
      return cb({ LOCK: { UPDATE: 'UPDATE' } }); // Pass a mock transaction object
    });

    // Mock DB queries used inside sendMessage
    models.Conversation = {
      findByPk: jest.fn().mockResolvedValue({
        id: 'conv-1',
        update: jest.fn().mockResolvedValue(true)
      })
    };

    models.ConversationParticipant = {
      findAll: jest.fn().mockResolvedValue([
        { userId: 'mentee-1' },
        { userId: 'mentor-1' }
      ])
    };

    models.User = {
      findAll: jest.fn().mockResolvedValue([
        { id: 'mentor-1', role: 'mentor' }
      ])
    };

    models.Message = {
      create: jest.fn().mockResolvedValue({
        id: 'msg-new',
        createdAt: new Date()
      }),
      findByPk: jest.fn().mockResolvedValue({
        id: 'msg-new',
        sender: { role: 'mentee' } // Mentee sender triggers orchestration
      })
    };

    models.Notification = {
      create: jest.fn().mockResolvedValue({})
    };

    // Prevent deep loop checks in messagingService
    messagingService.getAllowedRecipientIds = jest.fn().mockResolvedValue(null);
  });

  it('should trigger ragOrchestratorService for mentee messages', async () => {
    ragOrchestratorService.queueReplyGeneration.mockResolvedValueOnce(true);

    const result = await messagingService.sendMessage('mentee-1', {
      conversationId: 'conv-1',
      messageText: 'Hello Mentor!'
    });

    expect(result.message.id).toBe('msg-new');
    
    // Allow the microtask queue to process the then() block
    await new Promise(process.nextTick);
    
    expect(ragOrchestratorService.queueReplyGeneration).toHaveBeenCalledTimes(1);
    expect(ragOrchestratorService.queueReplyGeneration).toHaveBeenCalledWith('msg-new');
  });

  it('should not delay the mentee message if orchestrator hangs for a long time', async () => {
    // 1. Simulate a slow/hung RAG orchestrator that takes 3 seconds to resolve
    ragOrchestratorService.queueReplyGeneration.mockImplementation(() => {
      return new Promise(resolve => setTimeout(resolve, 3000));
    });

    const startMs = performance.now();

    const result = await messagingService.sendMessage('mentee-1', {
      conversationId: 'conv-1',
      messageText: 'I need help hanging!'
    });

    const elapsedMs = performance.now() - startMs;

    // 2. Mentee send should still return immediately (e.g. < 100ms) despite the 3s orchestrator hang
    expect(elapsedMs).toBeLessThan(100);
    expect(result.message.id).toBe('msg-new');
    
    // Allow the microtask queue to process the then() block
    await new Promise(process.nextTick);
    expect(ragOrchestratorService.queueReplyGeneration).toHaveBeenCalledWith('msg-new');
  });

  it('should NOT crash or delay sendMessage if ragOrchestratorService throws', async () => {
    // Force a rejection to test failure isolation
    ragOrchestratorService.queueReplyGeneration.mockRejectedValueOnce(new Error('LLM offline'));

    const start = performance.now();
    
    const result = await messagingService.sendMessage('mentee-1', {
      conversationId: 'conv-1',
      messageText: 'Hello Mentor!'
    });

    const end = performance.now();
    
    expect(result.message.id).toBe('msg-new');
    
    // The main request should not await the orchestrator, so it should be near instant
    // We expect the promise to resolve normally despite the fire-and-forget failure.
    expect(end - start).toBeLessThan(100);

    // Allow the microtask queue to flush
    await new Promise(process.nextTick);

    expect(ragOrchestratorService.queueReplyGeneration).toHaveBeenCalledTimes(1);
    // The test framework would crash if the rejection was unhandled.
    // The fact that the test reaches here proves the `.catch()` in messagingService works.
  });
});
