const EmbeddingProvider = require('./EmbeddingProvider');

class GeminiAdapter extends EmbeddingProvider {
  async embed(texts) {
    if (!texts || texts.length === 0) return [];
    
    // Process all texts in parallel
    const embedPromises = texts.map(async (t) => {
      const reqBody = {
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: t }] }
      };
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey 
        },
        body: JSON.stringify(reqBody)
      });
      
      if (!res.ok) {
        const errBody = await res.text();
        const error = new Error(`Gemini API Error: ${res.status} ${errBody}`);
        error.status = res.status;
        throw error;
      }
      
      const data = await res.json();
      let vec = data.embedding.values;
      if (vec.length > 1536) {
        vec = vec.slice(0, 1536);
      } else if (vec.length < 1536) {
        const padded = new Array(1536).fill(0);
        for (let i = 0; i < vec.length; i++) padded[i] = vec[i];
        vec = padded;
      }
      return vec;
    });

    return await Promise.all(embedPromises);
  }
}

module.exports = GeminiAdapter;
