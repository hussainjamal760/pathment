const pdf = require('pdf-parse');
const { ValidationError } = require('../utils/errors/errorTypes');

/**
 * Extracts raw text from a PDF buffer
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} The extracted plain text
 */
async function extractTextFromBuffer(buffer) {
  // 1. Verify Magic Bytes (%PDF-)
  if (buffer.length < 5 || buffer.toString('utf8', 0, 5) !== '%PDF-') {
    throw new ValidationError('Invalid file format: Not a PDF document (magic bytes mismatch).');
  }
  
  // 2. Enforce File Size (e.g. 10MB)
  if (buffer.length > 10 * 1024 * 1024) {
    throw new ValidationError('File is too large. Maximum PDF size is 10MB.');
  }

  try {
    const data = await pdf(buffer);
    
    // 3. Enforce Page Cap
    if (data.numpages > 50) {
      throw new ValidationError(`Document exceeds maximum allowed length of 50 pages (found ${data.numpages}).`);
    }

    // pdf-parse returns an object containing text, numpages, info, metadata, etc.
    return data.text || '';
  } catch (error) {
    console.error('[pdfParser] Error extracting text from PDF:', error);
    // Rethrow operational validation errors
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Failed to parse PDF document.');
  }
}

module.exports = {
  extractTextFromBuffer
};
