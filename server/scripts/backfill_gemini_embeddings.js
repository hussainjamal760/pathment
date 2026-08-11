const { models, sequelize } = require('../src/db');
const embeddingService = require('../src/services/embeddingService');
const ragIngestionService = require('../src/services/ragIngestionService');
const logger = require('../src/utils/ragLogger');

async function backfill() {
  console.log('Starting Gemini embedding backfill for existing knowledge chunks...');
  
  // Find all chunks where embedding is NULL
  const chunks = await models.KnowledgeChunk.findAll({
    where: {
      embedding: null
    },
    order: [['createdAt', 'ASC']]
  });

  if (chunks.length === 0) {
    console.log('No chunks with NULL embeddings found. Backfill complete.');
    process.exit(0);
  }

  console.log(`Found ${chunks.length} chunks requiring embeddings.`);

  // Process in small batches to respect rate limits
  const BATCH_SIZE = 50;
  let processedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    
    // We prepare the chunks in the format embedChunks expects
    const chunksToEmbed = batch.map(c => ({
      text: c.content,
      chunkIndex: c.chunkIndex,
      contentHash: c.contentHash,
      dbId: c.id
    }));

    try {
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} chunks)...`);
      // Use null userId since these are system-wide chunks or we can rely on org key
      const enrichedChunks = await embeddingService.embedChunks(chunksToEmbed, null);

      // Save embeddings back to DB
      for (const enriched of enrichedChunks) {
        if (enriched.embedding) {
          await sequelize.query(`
            UPDATE knowledge_chunks
            SET embedding = :embedding, updated_at = NOW()
            WHERE id = :id
          `, {
            replacements: { 
              embedding: JSON.stringify(enriched.embedding), 
              id: enriched.dbId 
            }
          });
          processedCount++;
        } else {
          errorCount++;
          console.warn(`Failed to get embedding for chunk ${enriched.dbId}`);
        }
      }
    } catch (err) {
      console.error(`Batch failed: ${err.message}`);
      errorCount += batch.length;
    }
    
    // Small delay between batches
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`Backfill complete. Successfully processed: ${processedCount}. Errors: ${errorCount}.`);
  process.exit(0);
}

if (require.main === module) {
  backfill().catch(err => {
    console.error('Fatal backfill error:', err);
    process.exit(1);
  });
}
