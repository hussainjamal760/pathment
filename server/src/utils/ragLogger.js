const baseLogger = require('./logger');

/**
 * Strips or truncates sensitive fields before logging.
 */
function sanitizeMeta(meta = {}) {
  const sanitized = { ...meta, subsystem: 'rag' };

  if (sanitized.embedding) {
    // Completely remove embeddings from logs to avoid blowing up log size
    sanitized.embedding = '[REDACTED_VECTOR]';
  }

  if (sanitized.content && typeof sanitized.content === 'string') {
    // Truncate raw content
    if (sanitized.content.length > 100) {
      sanitized.content = sanitized.content.substring(0, 100) + '... [TRUNCATED]';
    }
  }

  if (sanitized.text && typeof sanitized.text === 'string') {
    // Truncate raw text
    if (sanitized.text.length > 100) {
      sanitized.text = sanitized.text.substring(0, 100) + '... [TRUNCATED]';
    }
  }

  return sanitized;
}

module.exports = {
  info: (msg, meta) => baseLogger.info(msg, sanitizeMeta(meta)),
  warn: (msg, meta) => baseLogger.warn(msg, sanitizeMeta(meta)),
  error: (msg, meta) => baseLogger.error(msg, sanitizeMeta(meta))
};
