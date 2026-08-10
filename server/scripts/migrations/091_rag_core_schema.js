/**
 * Migration: 091_rag_core_schema
 *
 * Creates the four core tables for the RAG architecture:
 * 1. mentor_style_profiles
 * 2. knowledge_chunks
 * 3. message_drafts
 * 4. mentor_edit_histories
 *
 * Includes idempotency via UNIQUE constraint and vector indexes (HNSW, GIN).
 *
 * Run:      node server/scripts/migrations/091_rag_core_schema.js
 * Rollback: node server/scripts/migrations/091_rag_core_schema.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const now = () => Sequelize.fn('NOW');
const TS = () => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now() },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now() },
});

async function createTable(qi, name, spec) {
  try {
    await qi.createTable(name, spec);
    console.log(`  ✓ Created ${name}`);
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log(`  ℹ ${name} exists, skipping`);
    else throw e;
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 091: RAG core schema tables');

  // 1. mentor_style_profiles
  await createTable(qi, 'mentor_style_profiles', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    mentor_id: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    tone: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    vocabulary: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    signature: { type: Sequelize.TEXT, allowNull: true },
    custom_instructions: { type: Sequelize.TEXT, allowNull: true },
    ...TS(),
  });

  // 2. knowledge_chunks
  await createTable(qi, 'knowledge_chunks', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    source_type: { type: Sequelize.STRING(50), allowNull: false },
    source_id: { type: Sequelize.STRING(255), allowNull: false },
    source_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
    chunk_index: { type: Sequelize.INTEGER, allowNull: false },
    content_hash: { type: Sequelize.CHAR(64), allowNull: false },
    content: { type: Sequelize.TEXT, allowNull: false },
    // Raw column for vector since Sequelize dialect may not natively map vector() perfectly
    // We create it manually after table creation if needed, or rely on Sequelize literal
    // To be safe across versions, we can use a custom raw type or literal.
    // However, Sequelize >= 6.32 with pg allows Sequelize.STRING or Sequelize.BLOB, but the purest way is raw.
    // For standard migrations, if type fails we can alter table.
    // Actually, we can just use `type: 'VECTOR(1536)'` because Sequelize allows raw string types in createTable.
    embedding: { type: 'VECTOR(1536)', allowNull: true },
    search_vector: { type: 'TSVECTOR', allowNull: true },
    mentor_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    program_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'programs', key: 'id' }, onDelete: 'CASCADE' },
    visibility: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'public' },
    unlocked_roadmap_node_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
    ...TS(),
  });

  // 3. message_drafts
  await createTable(qi, 'message_drafts', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    message_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'messages', key: 'id' }, onDelete: 'CASCADE' },
    mentor_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    mentee_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    draft_reply: { type: Sequelize.TEXT, allowNull: false },
    confidence_score: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
    grounding_score: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
    status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'pending' },
    retrieved_chunk_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
    unsupported_spans: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
    ...TS(),
  });

  // 4. mentor_edit_histories
  await createTable(qi, 'mentor_edit_histories', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    draft_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'message_drafts', key: 'id' }, onDelete: 'CASCADE' },
    mentor_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    original_reply: { type: Sequelize.TEXT, allowNull: false },
    edited_reply: { type: Sequelize.TEXT, allowNull: false },
    edit_distance: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    ...TS(),
  });

  // Indexes & Constraints
  console.log('  Adding indexes and constraints...');
  try {
    // Unique constraint for idempotency
    await qi.addConstraint('knowledge_chunks', {
      fields: ['source_type', 'source_id', 'chunk_index', 'content_hash'],
      type: 'unique',
      name: 'unique_chunk_ingestion'
    });
    console.log('  ✓ Unique constraint unique_chunk_ingestion added');

    // HNSW Index on embedding
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding 
      ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
    `);
    console.log('  ✓ HNSW index on embedding added');

    // GIN Index on search_vector
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector 
      ON knowledge_chunks USING gin (search_vector);
    `);
    console.log('  ✓ GIN index on search_vector added');

    // B-Tree scope indexes
    await qi.addIndex('knowledge_chunks', ['program_id', 'mentor_id', 'visibility'], { name: 'idx_knowledge_chunks_scope' });
    await qi.addIndex('knowledge_chunks', ['source_type', 'source_id'], { name: 'idx_knowledge_chunks_source' });
    await qi.addIndex('message_drafts', ['status'], { name: 'idx_message_drafts_status' });
    await qi.addIndex('message_drafts', ['mentor_id'], { name: 'idx_message_drafts_mentor' });
    await qi.addIndex('mentor_edit_histories', ['mentor_id'], { name: 'idx_mentor_edit_histories_mentor' });

    console.log('  ✓ B-Tree indexes added');
  } catch (e) {
    if (/already exists/i.test(e.message)) {
      console.log('  ℹ Index or constraint already exists');
    } else {
      throw e;
    }
  }

  console.log('✅ Migration 091 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('◀ Rolling back migration 091: RAG core schema tables');

  try {
    // Drop in reverse order to respect foreign keys
    await qi.dropTable('mentor_edit_histories');
    console.log('  ✓ Dropped mentor_edit_histories');

    await qi.dropTable('message_drafts');
    console.log('  ✓ Dropped message_drafts');

    await qi.dropTable('knowledge_chunks');
    console.log('  ✓ Dropped knowledge_chunks');

    await qi.dropTable('mentor_style_profiles');
    console.log('  ✓ Dropped mentor_style_profiles');

    console.log('✅ Rollback 091 complete');
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  }
}

// Run migration
if (require.main === module) {
  const args = process.argv.slice(2);
  const isRollback = args.includes('--rollback') || args.includes('-r');

  (async () => {
    try {
      if (isRollback) {
        await down();
      } else {
        await up();
      }
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
