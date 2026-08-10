const baseLogger = require('../../src/utils/logger');
const ragLogger = require('../../src/utils/ragLogger');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('ragLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should append { subsystem: "rag" } to meta', () => {
    ragLogger.info('Test info', { userId: 123 });
    expect(baseLogger.info).toHaveBeenCalledWith('Test info', {
      userId: 123,
      subsystem: 'rag'
    });
  });

  it('should redact embedding vectors from meta', () => {
    ragLogger.warn('Test warn', {
      embedding: [0.1, 0.2, 0.3, 0.4],
      chunkId: 5
    });

    expect(baseLogger.warn).toHaveBeenCalledWith('Test warn', {
      embedding: '[REDACTED_VECTOR]',
      chunkId: 5,
      subsystem: 'rag'
    });
  });

  it('should truncate content field if it is too long', () => {
    const longString = 'A'.repeat(150);
    ragLogger.error('Test error', { content: longString });

    const calledMeta = baseLogger.error.mock.calls[0][1];
    expect(calledMeta.subsystem).toBe('rag');
    expect(calledMeta.content).toHaveLength(100 + '... [TRUNCATED]'.length);
    expect(calledMeta.content.endsWith('... [TRUNCATED]')).toBe(true);
  });

  it('should truncate text field if it is too long', () => {
    const longString = 'B'.repeat(200);
    ragLogger.info('Test text info', { text: longString });

    const calledMeta = baseLogger.info.mock.calls[0][1];
    expect(calledMeta.subsystem).toBe('rag');
    expect(calledMeta.text).toHaveLength(100 + '... [TRUNCATED]'.length);
    expect(calledMeta.text.endsWith('... [TRUNCATED]')).toBe(true);
  });

  it('should not truncate short content', () => {
    ragLogger.info('Short msg', { content: 'Short content', text: 'Short text' });
    expect(baseLogger.info).toHaveBeenCalledWith('Short msg', {
      content: 'Short content',
      text: 'Short text',
      subsystem: 'rag'
    });
  });
});
