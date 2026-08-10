const styleLearningService = require('../../src/services/styleLearningService');
const { models, sequelize } = require('../../src/db');
const embeddingService = require('../../src/services/embeddingService');
const ragConfig = require('../../src/config/ragConfig');

jest.mock('../../src/db');
jest.mock('../../src/services/embeddingService');

describe('Style Learning Loop (RLAIF)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    sequelize.transaction.mockImplementation(async (cb) => {
      return cb({ LOCK: { UPDATE: 'UPDATE' } });
    });

    models.MentorEditHistory = {
      findByPk: jest.fn(),
      update: jest.fn()
    };
    models.KnowledgeChunk = {
      findOne: jest.fn(),
      create: jest.fn()
    };
    models.MentorStyleProfile = {
      findOne: jest.fn(),
      create: jest.fn()
    };
  });

  describe('Level 4 Reference Re-embedding', () => {
    it('should embed the final text and save it to KnowledgeChunks', async () => {
      const mockEditHistory = {
        id: 'edit-1',
        mentorId: 'mentor-1',
        originalContent: 'Short',
        finalContent: 'This is the final approved response',
        editDistance: 2,
        processed: false,
        update: jest.fn()
      };

      models.MentorEditHistory.findByPk.mockResolvedValue(mockEditHistory);
      models.KnowledgeChunk.findOne.mockResolvedValue(null);
      embeddingService.getEmbedding.mockResolvedValue(new Array(1536).fill(0.1));

      await styleLearningService.processEditHistory('edit-1');

      expect(embeddingService.getEmbedding).toHaveBeenCalledWith('This is the final approved response');
      expect(models.KnowledgeChunk.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'message',
          sourceId: 'edit-1',
          mentorId: 'mentor-1',
          visibility: 'mentor'
        }),
        expect.anything()
      );
      
      expect(mockEditHistory.update).toHaveBeenCalledWith({ processed: true }, expect.anything());
    });
  });

  describe('Bounded Style Adjustments', () => {
    it('should safely bound a massive edit shift and update tone metrics', async () => {
      const mockEditHistory = {
        id: 'edit-2',
        mentorId: 'mentor-1',
        originalContent: 'Very long text '.repeat(100),
        finalContent: 'Short', // Massively shorter, brevity shift will be +0.5
        editDistance: 500, // Exceeds significance threshold of 10
        processed: false,
        update: jest.fn()
      };

      const mockStyleProfile = {
        id: 'profile-1',
        mentorId: 'mentor-1',
        tone: { brevity: 0.5, formality: 0.5 },
        vocabulary: {},
        update: jest.fn()
      };

      models.MentorEditHistory.findByPk.mockResolvedValue(mockEditHistory);
      models.MentorStyleProfile.findOne.mockResolvedValue(mockStyleProfile);
      
      // Override config max delta for this test
      ragConfig.maxStyleDeltaPerUpdate = 0.10;

      await styleLearningService.processEditHistory('edit-2');

      // It should calculate a brevity shift of +0.5, but cap it at +0.10
      expect(mockStyleProfile.update).toHaveBeenCalledWith(
        {
          tone: {
            brevity: 0.60, // 0.5 + bounded(0.10)
            formality: 0.50 // no emoji change = 0
          }
        },
        expect.anything()
      );
    });

    it('should skip style learning if edit distance is below threshold', async () => {
      const mockEditHistory = {
        id: 'edit-3',
        mentorId: 'mentor-1',
        originalContent: 'Hello',
        finalContent: 'Hello!',
        editDistance: 1, // Below default 10
        processed: false,
        update: jest.fn()
      };

      models.MentorEditHistory.findByPk.mockResolvedValue(mockEditHistory);
      
      await styleLearningService.processEditHistory('edit-3');

      expect(models.MentorStyleProfile.findOne).not.toHaveBeenCalled();
    });
  });
});
