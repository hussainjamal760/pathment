const pdf = require('pdf-parse');

/**
 * Extracts raw text from a PDF buffer
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} The extracted plain text
 */
async function extractTextFromBuffer(buffer) {
  try {
    const data = await pdf(buffer);
    // pdf-parse returns an object containing text, numpages, info, metadata, etc.
    return data.text || '';
  } catch (error) {
    console.error('[pdfParser] Error extracting text from PDF:', error);
    throw new Error('Failed to parse PDF document.');
  }
}

module.exports = {
  extractTextFromBuffer
};
