require('dotenv').config();
const groqService = require('../src/services/groqService');

async function checkModels() {
  try {
    const groqService = require('../src/services/groqService');
    const { apiKey } = await groqService._resolve('rag_embedding', 'ad1216f3-bd11-4355-8cf5-7884f47ebc08');
    console.log('Got API key, length:', apiKey ? apiKey.length : 0);
    
    if (!apiKey) {
      console.log('No API key found');
      return;
    }
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: 'hello world' }] }
      })
    });
    const data = await res.json();
    console.log('Embedding values length:', data.embedding?.values?.length);
    console.log('Sample values:', data.embedding?.values?.slice(0, 5));
  } catch(e) {
    console.error(e);
  }
}
checkModels();
