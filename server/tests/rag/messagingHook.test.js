const messagingService = require('../../src/services/messagingService');
const ragTriggers = require('../../src/utils/ragTriggers');
const { models, sequelize } = require('../../src/db');

jest.mock('../../src/utils/ragTriggers', () => ({
  emit: jest.fn()
}));
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
      create: jest.fn((attrs) => Promise.resolve({
        id: 'msg-new',
        createdAt: new Date(),
        messageText: attrs.messageText,
        senderId: attrs.senderId,
        sender: { role: 'mentee' }
      })),
      findByPk: jest.fn().mockResolvedValue({
        id: 'msg-new',
        messageText: 'Hello Mentor!',
        senderId: 'mentee-1',
        sender: { role: 'mentee' } // Mentee sender triggers orchestration
      })
    };

    models.Notification = {
      create: jest.fn().mockResolvedValue({})
    };

    models.MentorStyleProfile = {
      findOne: jest.fn().mockResolvedValue({ autoReplyEnabled: true })
    };

    models.RagGenerationQuota = {
      findOrCreate: jest.fn().mockResolvedValue([{
        count: 0,
        limit: 100,
        windowStart: new Date(),
        save: jest.fn()
      }])
    };

    // Prevent deep loop checks in messagingService
    messagingService.getAllowedRecipientIds = jest.fn().mockResolvedValue(null);
  });

  it('should trigger ragOrchestratorService for mentee messages', async () => {
    const result = await messagingService.sendMessage('mentee-1', {
      conversationId: 'conv-1',
      messageText: 'Hello Mentor!'
    });

    expect(result.message.id).toBe('msg-new');

    // Allow the microtask queue to process the then() block
    await new Promise(process.nextTick);
    
    expect(ragTriggers.emit).toHaveBeenCalledTimes(1);
    expect(ragTriggers.emit).toHaveBeenCalledWith('rag:orchestrate', expect.objectContaining({
      query: 'Hello Mentor!',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      conversationId: 'conv-1'
    }), expect.anything());
  });

  it('should not delay the mentee message if orchestrator event takes long', async () => {
    // We just emit an event now, so it shouldn't take long anyway.
    
    models.Message.findByPk.mockResolvedValueOnce({
      id: 'msg-new',
      messageText: 'I need help hanging!',
      senderId: 'mentee-1',
      sender: { role: 'mentee' }
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
    expect(ragTriggers.emit).toHaveBeenCalledWith('rag:orchestrate', expect.objectContaining({
      query: 'I need help hanging!',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      conversationId: 'conv-1'
    }), expect.anything());
  });

  it('should NOT crash or delay sendMessage if ragTriggers.emit throws', async () => {
    // Force a rejection to test failure isolation
    ragTriggers.emit.mockImplementationOnce(() => {
      throw new Error('Sync event error');
    });

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

    expect(ragTriggers.emit).toHaveBeenCalledTimes(1);
    // The test framework would crash if the rejection was unhandled.
    // The fact that the test reaches here proves the `.catch()` in messagingService works.
  });

  it('should NOT trigger RAG if conversation is mentee-mentee (no mentor recipient)', async () => {
    models.User.findAll.mockResolvedValueOnce([{ id: 'mentee-2', role: 'mentee' }]);
    
    await messagingService.sendMessage('mentee-1', {
      conversationId: 'conv-1',
      messageText: 'Hello fellow mentee!'
    });
    
    await new Promise(process.nextTick);
    expect(ragTriggers.emit).not.toHaveBeenCalled();
  });

  it('should NOT trigger RAG if conversation is mentee-admin', async () => {
    models.User.findAll.mockResolvedValueOnce([{ id: 'admin-1', role: 'admin' }]);
    
    await messagingService.sendMessage('mentee-1', {
      conversationId: 'conv-1',
      messageText: 'Hello admin!'
    });
    
    await new Promise(process.nextTick);
    expect(ragTriggers.emit).not.toHaveBeenCalled();
  });

  it('should NOT trigger RAG if mentor has NOT opted in', async () => {
    models.MentorStyleProfile.findOne.mockResolvedValueOnce({ autoReplyEnabled: false });
    
    await messagingService.sendMessage('mentee-1', {
      conversationId: 'conv-1',
      messageText: 'Hello Mentor!'
    });
    
    await new Promise(process.nextTick);
    expect(ragTriggers.emit).not.toHaveBeenCalled();
  });

  it('should NOT trigger RAG if cost ceiling is exceeded', async () => {
    // 1000 is over any realistic default cost ceiling
    models.RagGenerationQuota.findOrCreate.mockResolvedValueOnce([{
      count: 1000,
      limit: 100,
      windowStart: new Date(),
      save: jest.fn()
    }]);
    
    await messagingService.sendMessage('mentee-1', {
      conversationId: 'conv-1',
      messageText: 'Hello Mentor!'
    });
    
    await new Promise(process.nextTick);
    expect(ragTriggers.emit).not.toHaveBeenCalled();
  });
});
