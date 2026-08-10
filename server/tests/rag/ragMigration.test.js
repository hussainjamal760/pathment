const sequelize = require('../../scripts/migrations/_db');
const migration = require('../../scripts/migrations/091_rag_core_schema');

describe('091_rag_core_schema migration', () => {
  beforeAll(async () => {
    // Run up migration to ensure tables exist
    await migration.up();
  });

  afterAll(async () => {
    // Rollback for cleanup
    await migration.down();
  });

  it('should enforce idempotency on knowledge_chunks via unique constraint', async () => {
    // Create a chunk
    const chunkData = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      source_type: 'document',
      source_id: 'doc_123',
      source_version: 1,
      chunk_index: 0,
      content_hash: 'f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2',
      content: 'This is a test chunk.',
      visibility: 'public'
    };

    // First insert should succeed
    await sequelize.query(`
      INSERT INTO knowledge_chunks (id, source_type, source_id, source_version, chunk_index, content_hash, content, visibility)
      VALUES (:id, :source_type, :source_id, :source_version, :chunk_index, :content_hash, :content, :visibility)
    `, {
      replacements: chunkData
    });

    // Second insert with identical constraint fields should fail
    const duplicateData = { ...chunkData, id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' };

    await expect(sequelize.query(`
      INSERT INTO knowledge_chunks (id, source_type, source_id, source_version, chunk_index, content_hash, content, visibility)
      VALUES (:id, :source_type, :source_id, :source_version, :chunk_index, :content_hash, :content, :visibility)
    `, {
      replacements: duplicateData
    })).rejects.toThrow(/Validation error/i);
    
    // Testing safe upsert (which we'll use in the application code):
    // INSERT ... ON CONFLICT DO NOTHING should succeed without error
    const upsertResult = await sequelize.query(`
      INSERT INTO knowledge_chunks (id, source_type, source_id, source_version, chunk_index, content_hash, content, visibility)
      VALUES (:id, :source_type, :source_id, :source_version, :chunk_index, :content_hash, :content, :visibility)
      ON CONFLICT (source_type, source_id, chunk_index, content_hash) DO NOTHING
    `, {
      replacements: duplicateData
    });
    
    // 0 rows affected by the DO NOTHING
    expect(upsertResult[1]).toBe(0); 
  });
});
