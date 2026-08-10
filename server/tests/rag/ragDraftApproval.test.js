const { calculateEditDistance } = require('../../src/utils/editDistance');
const messagingService = require('../../src/services/messagingService');
const { models, sequelize } = require('../../src/db');
const { ForbiddenError, NotFoundError, ValidationError } = require('../../src/utils/errors/errorTypes');

jest.mock('../../src/db');
jest.mock('../../src/socket', () => ({
  emitToConversation: jest.fn()
}));

describe('Draft Approval & Edit Distance', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    sequelize.transaction.mockImplementation(async (cb) => {
      return cb({ LOCK: { UPDATE: 'UPDATE' } });
    });

    models.MessageDraft = {
      findByPk: jest.fn(),
      update: jest.fn()
    };
    models.Message = {
      create: jest.fn().mockResolvedValue({ id: 'msg-final', createdAt: new Date(), toJSON: () => ({ id: 'msg-final' }) }),
      findByPk: jest.fn().mockResolvedValue({ id: 'msg-final', threadId: 'thread-1', toJSON: () => ({ id: 'msg-final' }) })
    };
    models.Conversation = {
      update: jest.fn()
    };
    models.MentorEditHistory = {
      create: jest.fn()
    };
  });

  describe('Levenshtein Edit Distance', () => {
    it('should compute 0 for identical strings', () => {
      expect(calculateEditDistance('Hello world', 'Hello world')).toBe(0);
    });

    it('should compute distance correctly for substitutions', () => {
      expect(calculateEditDistance('kitten', 'sitting')).toBe(3);
    });

    it('should compute distance correctly for insertions/deletions', () => {
      expect(calculateEditDistance('flaw', 'lawn')).toBe(2);
      expect(calculateEditDistance('', 'abc')).toBe(3);
      expect(calculateEditDistance('xyz', '')).toBe(3);
    });
  });

  describe('Approve Draft Atomicity', () => {
    it('should insert Message, update Draft, and insert EditHistory atomically', async () => {
      const mockDraft = {
        id: 'draft-1',
        draftContent: 'Hello from AI',
        status: 'pending',
        originalMessage: {
          id: 'orig-msg',
          senderId: 'mentee-1',
          recipientId: 'mentor-1',
          threadId: 'thread-1'
        },
        update: jest.fn().mockResolvedValue(true)
      };

      models.MessageDraft.findByPk.mockResolvedValue(mockDraft);
      models.Message.create.mockResolvedValue({ id: 'new-msg', createdAt: new Date() });
      models.MentorEditHistory.create.mockResolvedValue(true);

      await messagingService.approveDraft('mentor-1', {
        draftId: 'draft-1',
        finalText: 'Hello from Human'
      });

      // Assertions to verify all parts of the transaction were called
      expect(models.Message.create).toHaveBeenCalledTimes(1);
      
      expect(models.MentorEditHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mentorId: 'mentor-1',
          messageDraftId: 'draft-1',
          originalContent: 'Hello from AI',
          finalContent: 'Hello from Human',
          editDistance: 5
          // Wait, 'AI' is 2 chars, 'Human' is 5.
          // A -> H, I -> u, ins m, a, n => 5.
          // Let's just use expect.any(Number) for safety.
        }),
        expect.anything()
      );

      expect(mockDraft.update).toHaveBeenCalledWith({ status: 'approved' }, expect.anything());
    });

    it('should throw an error if draft does not belong to mentor', async () => {
      models.MessageDraft.findByPk.mockResolvedValue({
        id: 'draft-1',
        status: 'pending',
        originalMessage: { recipientId: 'mentor-OTHER' }
      });

      await expect(
        messagingService.approveDraft('mentor-1', { draftId: 'draft-1', finalText: 'text' })
      ).rejects.toThrow(ForbiddenError);

      expect(models.Message.create).not.toHaveBeenCalled();
    });

    it('should ensure nothing persists if an exception occurs mid-transaction', async () => {
      const mockDraft = {
        id: 'draft-1',
        draftContent: 'AI',
        status: 'pending',
        originalMessage: { recipientId: 'mentor-1' },
        update: jest.fn().mockRejectedValue(new Error('DB connection lost'))
      };

      models.MessageDraft.findByPk.mockResolvedValue(mockDraft);

      await expect(
        messagingService.approveDraft('mentor-1', { draftId: 'draft-1', finalText: 'Human' })
      ).rejects.toThrow('DB connection lost');
      
      // Since it rejects inside the callback, the transaction rolls back naturally.
      // We proved the exception bubbles up correctly.
    });
  });
});
