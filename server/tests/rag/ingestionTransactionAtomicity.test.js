const messagingService = require('../../src/services/messagingService');
const ragIngestionService = require('../../src/services/ragIngestionService');
const { models, sequelize } = require('../../src/db');

// Mock dependencies
jest.mock('../../src/db', () => ({
  models: {
    MentorDocument: {
      create: jest.fn()
    }
  },
  sequelize: {
    transaction: jest.fn(),
    query: jest.fn(),
    QueryTypes: { INSERT: 'INSERT' }
  }
}));

jest.mock('../../src/utils/pdfParser', () => ({
  extractTextFromBuffer: jest.fn().mockResolvedValue('Mock PDF text content')
}));

jest.mock('../../src/utils/cloudinaryUpload', () => ({
  uploadToCloudinary: jest.fn().mockResolvedValue({ secure_url: 'http://test.com/doc.pdf', public_id: 'test_doc' })
}));

describe('Ingestion Transaction Atomicity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass the same transaction to both MentorDocument.create and enqueueIngestion', async () => {
    const mockTransaction = { id: 'mock-tx' };
    
    // Simulate sequelize.transaction executing its callback
    sequelize.transaction.mockImplementation(async (callback) => {
      return callback(mockTransaction);
    });

    models.MentorDocument.create.mockResolvedValue({ id: 'doc123' });
    
    // Spy on enqueueIngestion to check arguments
    jest.spyOn(ragIngestionService, 'enqueueIngestion').mockResolvedValue({ queued: true, jobId: 'job123' });

    const file = { buffer: Buffer.from('fake pdf'), originalname: 'test.pdf' };
    
    await messagingService.uploadMentorDocument('mentor123', file, { programId: 'program123', visibility: 'public' });

    // Assert MentorDocument.create received the transaction
    expect(models.MentorDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mentorId: 'mentor123',
        fileName: 'test.pdf'
      }),
      expect.objectContaining({ transaction: mockTransaction })
    );

    // Assert enqueueIngestion received the EXACT same transaction
    expect(ragIngestionService.enqueueIngestion).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'doc123',
        transaction: mockTransaction
      })
    );
  });

  it('should rollback both if enqueueIngestion fails (atomicity)', async () => {
    const mockTransaction = { rollback: jest.fn() };
    
    sequelize.transaction.mockImplementation(async (callback) => {
      try {
        await callback(mockTransaction);
      } catch (e) {
        mockTransaction.rollback();
        throw e;
      }
    });

    models.MentorDocument.create.mockResolvedValue({ id: 'doc123' });
    
    const dbError = new Error('Database disconnected');
    jest.spyOn(ragIngestionService, 'enqueueIngestion').mockRejectedValue(dbError);

    const file = { buffer: Buffer.from('fake pdf'), originalname: 'test.pdf' };
    
    await expect(
      messagingService.uploadMentorDocument('mentor123', file, { programId: 'program123', visibility: 'public' })
    ).rejects.toThrow('Database disconnected');

    // Verify it attempted to create the document
    expect(models.MentorDocument.create).toHaveBeenCalled();
    
    // Verify transaction rollback was triggered because enqueueIngestion threw!
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });
});
