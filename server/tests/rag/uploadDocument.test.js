const { uploadMentorDocument } = require('../../src/services/messagingService');
const { ValidationError } = require('../../src/utils/errors/errorTypes');
const pdfParser = require('../../src/utils/pdfParser');
const ragIngestionService = require('../../src/services/ragIngestionService');
const cloudinaryUpload = require('../../src/utils/cloudinaryUpload');

// Mock external dependencies
jest.mock('../../src/services/ragIngestionService', () => ({
  enqueueIngestion: jest.fn()
}));
jest.mock('../../src/utils/cloudinaryUpload', () => ({
  uploadToCloudinary: jest.fn().mockResolvedValue({ secure_url: 'http://example.com/test.pdf', public_id: 'test' })
}));
jest.mock('../../src/db', () => ({
  models: {
    MentorDocument: {
      create: jest.fn().mockResolvedValue({})
    }
  },
  sequelize: {
    transaction: jest.fn((cb) => cb({}))
  }
}));

describe('Document Upload Validation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a renamed .zip with a fake .pdf extension', async () => {
    // Create a dummy ZIP buffer (starts with PK)
    const fakePdfBuffer = Buffer.from('PK\\x03\\x04somezipdata');
    const file = {
      buffer: fakePdfBuffer,
      originalname: 'sneaky.pdf',
      mimetype: 'application/pdf' // spoofed
    };

    await expect(uploadMentorDocument('mentor123', file))
      .rejects.toThrow(ValidationError);

    // Verify chunking/ingestion was never reached
    expect(ragIngestionService.enqueueIngestion).not.toHaveBeenCalled();
  });

  it('rejects an oversized valid PDF before chunking is attempted', async () => {
    // Create a massive buffer with PDF magic bytes
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 'a'); // 11MB
    oversizedBuffer.write('%PDF-', 0);

    const file = {
      buffer: oversizedBuffer,
      originalname: 'huge.pdf',
      mimetype: 'application/pdf'
    };

    await expect(uploadMentorDocument('mentor123', file))
      .rejects.toThrow(ValidationError);

    // Verify chunking/ingestion was never reached
    expect(ragIngestionService.enqueueIngestion).not.toHaveBeenCalled();
  });
});
