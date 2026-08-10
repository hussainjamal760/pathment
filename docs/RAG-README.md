# RAG Implementation Progress

This document tracks the phased rollout of the Retrieval-Augmented Generation (RAG) system for the Pathment platform.

## ✅ Phase 0: Foundations & Config
- **Postgres pgvector setup:** Validated Supabase backend capabilities and configured `env.js` test safeguards.
- **Config Management:** Created `src/config/ragConfig.js` to store all RAG-related magic variables (model names, dimensions, chunk sizes, token overlaps, confidence thresholds). This guarantees no inline magic numbers in subsequent code.
- **Logging:** Created `src/utils/ragLogger.js` for structured logging, appending `subsystem: rag` to metrics for clean telemetry and tracing.
- **Idempotency Standards:** Established the use of `sha256` hashing to ensure idempotent ingestion across layers.

## ✅ Phase 1: Database Schema & Migrations
- **Core Schemas:** Created migration `091_rag_core_schema.js`.
  - `mentor_style_profiles`: Context tracking per mentor.
  - `knowledge_chunks`: Main embedding storage using `pgvector`. Added an `HNSW` index for fast vector searching and a `GIN` index on `search_vector` for hybrid keyword matching.
  - `message_drafts`: Storage for RAG-augmented AI generated responses.
  - `mentor_edit_histories`: Track human vs AI edits for feedback loops.
- **Integrity Constraints:** Added `UNIQUE (source_type, source_id, chunk_index, content_hash)` on `knowledge_chunks` to prevent overlapping rows. Tests verified safe idempotent insertions.

## ✅ Phase 2: Ingestion Pipeline
- **Job Queue Table:** Created `092_rag_ingestion_jobs.js` to handle asynchronous processing using the `FOR UPDATE SKIP LOCKED` pattern (mimicking the `emailWorker`).
- **Services:**
  - **`chunkingService.js`:** Sliding-window textual chunker based on config dimensions.
  - **`embeddingService.js`:** SHA-256 caching and API wrapping for the embeddings endpoint with built-in exponential backoff.
  - **`ragIngestionService.js`:** Core ingestion logic utilizing `INSERT ... ON CONFLICT DO NOTHING` for idempotency and safe `:vector` casting.
- **Worker & Triggers:** Added `ragIngestionWorker.js` background polling mechanism and `ragTriggers.js` for document event hooks.
- **Verification:** Wrote unit & integration tests (`ragIngestionWorker.test.js`) and verified them fully against the connected database.

## ✅ Phase 3: Retrieval Layer & Hybrid Search
- **Hybrid Retrieval (`retrievalService.js`)**: Implemented dual-query parallel execution over both vector semantic search (`<=>`) and Postgres Full Text Search (`ts_rank` with `websearch_to_tsquery`).
- **Reciprocal Rank Fusion (RRF)**: Implemented mathematical RRF scaling (k-constant dynamically loaded from config) to merge and rerank semantic vs keyword scores for maximum relevance.
- **Token Budget Trimming**: Pack results by estimating context payload size, strictly preventing LLM context window overflows.
- **Strict Authorization Filters**: Applied multi-tenant visibility scopes (`public`, `program`, `mentor`, `roadmap`) directly in the SQL `WHERE` and `IN` clauses to prevent data leakage.
- **Verification**: Hand-computed RRF values for test fixtures and executed `retrievalAuthorization.test.js` against the live DB to guarantee no boundary leaks happen on retrieval. (Seed data strictly uses adversarial, near-duplicate vocabulary to prevent false ranking passes).


## ✅ Phase 4: Grounding Check & Output Formatting
- **Factual Verification (`groundingService.js`)**: Evaluates drafts using a strict JSON-mode LLM check to ensure every factual claim maps directly back to the retrieved context chunks.
- **Safety Downgrading**: Combines self-reported LLM confidence with the rigorous `groundingScore`. Utilizes a `min()` strategy to force highly confident but hallucinated drafts into a `review` or `abstain` state, preventing ungrounded auto-replies.
- **Resilience**: The grounding call includes an internal retry loop. If grounding fails entirely due to an LLM outage, the system safely falls back to a strict `abstain` state with `groundingScore: 0` and logs the original draft for support visibility.
- **Verification**: Built `groundingService.test.js` to ensure the logic accurately penalizes unsupported claims and overrides the naive LLM confidence levels properly.

## ✅ Phase 5: Prompt Construction & LLM Orchestration
- **Prompt Assembly (`promptBuilderService.js`)**: Dynamically groups retrieved chunks by predetermined trust tiers (e.g., Mentor > Roadmap > Program) and smartly prioritizes context insertion, trimming from the bottom-up to securely fit within the LLM's defined context token budget.
- **Unified Orchestrator (`ragOrchestratorService.js`)**: Encapsulates the complete journey (Message ➔ Retrieve Context ➔ Build Prompt ➔ Generate ➔ Grounding Check ➔ Branch) ensuring separation of concerns.
- **Confidence Tier Routing**: Implemented strict branching logic that channels final states directly into persistence functions (creating a new sent `Message`, placing it in `MessageDrafts` for review, or silently logging an `abstain` action).
- **Verification**: Built an orchestration test suite mocking integration boundaries across all three tiers, completely separating generation logic from DB writing logic.

## ✅ Phase 6: Messaging Hooks & Real-Time Events
- **Non-blocking Orchestration**: Wired the entry point to `.then().catch()` directly onto the end of the `sendMessage` core transaction. By isolating this call, even total LLM API failures (or hung requests taking >30s) cannot delay or fail the mentee's primary messaging API response.
- **WebSockets (`ai_draft:new`, `message:new`)**: Emits localized web socket payloads into the Mentor's user room (for drafts needing review) and the Conversation room (for fully autonomous AI replies), negating any need for client polling.
- **Verification**: Created `messagingHook.test.js` to assert that the `sendMessage` process returns success `200` rapidly (< 100ms) regardless of how the RAG Orchestrator performs or hangs asynchronously.

## ✅ Phase 7: Frontend Drafts Panel & Editing
- **Levenshtein Distance (`editDistance.js`)**: Developed a utility to compute character-level edit distance between AI drafts and final human edits. This provides the primary positive/negative reinforcement signal for the RAG feedback loop.
- **Atomic Approval (`POST /messages/approve`)**: Implemented a transactional endpoint that creates the final `Message`, logs to `MentorEditHistories`, updates the `MessageDraft`, and emits the `message:new` socket event atomically.
- **Interactive Mentor UI (`MessageCenter.tsx`)**: Created a "Pending AI Drafts" panel that listens to the `ai_draft:new` socket. Mentors can view confidence scores, expand an inline text editor, review/modify the AI's response, and approve it instantly.
- **Verification**: Developed `ragDraftApproval.test.js` to assert mathematical accuracy of the edit distance algorithm and guarantee that DB transactions roll back entirely if any table insertion fails during draft approval.

## ✅ Phase 8: Style Learning Loop (RLAIF)
- **Level 4 Reference Re-embedding**: Added logic to `styleLearningService.js` that automatically computes a SHA-256 hash of the final mentor-approved reply, embeds it via `embeddingService`, and saves it to `KnowledgeChunks` as `sourceType = 'message'`. This constructs a high-quality "Level 4" reference corpus scoped directly to that mentor.
- **Bounded Style Updates**: The service analyzes edit diffs (e.g., brevity, formality) and mathematically enforces a bounded update limit (maximum `0.10` shift per dimension per edit). This guarantees that a single massive rewrite cannot skew the mentor's long-term style profile.
- **Background Worker (`styleLearningWorker.js`)**: Polls for new un-processed `MentorEditHistories` rows, processing them asynchronously in the background.
- **Audit Logging**: Any shifts in tone or vocabulary are immediately tracked via `ragLogger.info('style_profile_updated')` showing the precise before, after, and shift values.
- **Verification**: Built `styleLearningWorker.test.js` to test adversarial scenarios (e.g., an edit distance of `500`) and verified that the resulting style shift was safely capped at `0.10`.

## 📌 Open Items & Future Work
- **Process-Crash Durability for Generation Queue**: In Phase 6, the `ragOrchestratorService.queueReplyGeneration` call is wired as a pure in-memory Promise chain (fire-and-forget `.catch()`). This perfectly isolates latency, but if the Node server restarts or crashes exactly during a generation cycle, the job is silently lost and the mentee will not get an AI reply. 
  - **Action Item**: Introduce a persistent job queue (e.g., BullMQ or a `rag_jobs` table with `FOR UPDATE SKIP LOCKED`) specifically for the orchestrator generation pipeline to ensure true fault tolerance.
