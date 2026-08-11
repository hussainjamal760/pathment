const GeminiAdapter = require('./geminiAdapter');

function getAdapter(provider, apiKey) {
  // We only support Gemini as per P16. 
  // Any provider falls back to our pinned model.
  return new GeminiAdapter(apiKey);
}

module.exports = {
  getAdapter
};
