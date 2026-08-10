require('dotenv').config();

module.exports = {
  embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
  embeddingDimensions: parseInt(process.env.RAG_EMBEDDING_DIMENSIONS) || 1536,
  chunkTokenSize: parseInt(process.env.RAG_CHUNK_TOKEN_SIZE) || 250,
  chunkTokenOverlap: parseInt(process.env.RAG_CHUNK_TOKEN_OVERLAP) || 50,
  rrfK: parseInt(process.env.RAG_RRF_K) || 60,
  autoReplyConfidenceThreshold: parseFloat(process.env.RAG_AUTO_REPLY_CONFIDENCE_THRESHOLD) || 0.90,
  draftReviewConfidenceThreshold: parseFloat(process.env.RAG_DRAFT_REVIEW_CONFIDENCE_THRESHOLD) || 0.60,
  contextTokenBudget: parseInt(process.env.RAG_CONTEXT_TOKEN_BUDGET) || 3000,
  // Grounding Check specific config
  groundingSimilarityThreshold: parseFloat(process.env.RAG_GROUNDING_SIMILARITY_THRESHOLD) || 0.75, // Used for quick embedding checks
  groundingCombinationStrategy: process.env.RAG_GROUNDING_COMBINATION_STRATEGY || 'min', // Options: 'min', 'average', 'weighted'
  // Style Learning config
  editDistanceSignificanceThreshold: parseInt(process.env.RAG_EDIT_DISTANCE_SIGNIFICANCE_THRESHOLD) || 10,
  maxStyleDeltaPerUpdate: parseFloat(process.env.RAG_MAX_STYLE_DELTA_PER_UPDATE) || 0.10,
  styleLearningBatchSize: parseInt(process.env.RAG_STYLE_LEARNING_BATCH_SIZE) || 10,
  styleLearningPollIntervalMs: parseInt(process.env.RAG_STYLE_LEARNING_POLL_INTERVAL_MS) || 5000
};
