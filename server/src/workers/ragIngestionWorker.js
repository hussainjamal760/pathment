/**
 * ragIngestionWorker.js
 * 
 * Background polling worker for processing RAG ingestion queue.
 * Claims batches of jobs safely using FOR UPDATE SKIP LOCKED.
 */
const ragIngestionService = require('../services/ragIngestionService');
const logger = require('../utils/ragLogger');

const POLL_MS = Number(process.env.RAG_WORKER_POLL_MS) || 15000; // 15s
const BATCH = Number(process.env.RAG_WORKER_BATCH) || 10;

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    let res = await ragIngestionService.processBatch(BATCH);
    
    // Drain bursts
    let guard = 0;
    while (res.claimed >= BATCH && guard++ < 5) {
      res = await ragIngestionService.processBatch(BATCH);
    }
  } catch (err) {
    logger.error('rag_worker_tick_error', { error: err?.message });
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  console.log(`✓ RAG Ingestion Worker started (poll ${POLL_MS}ms, batch ${BATCH})`);
}

function stop() {
  if (timer) { 
    clearInterval(timer); 
    timer = null; 
    console.log(`✓ RAG Ingestion Worker stopped`);
  }
}

module.exports = { start, stop, tick };
