const { sequelize } = require('../../src/db');
const retrievalService = require('../../src/services/retrievalService');
const embeddingService = require('../../src/services/embeddingService');
const migration092 = require('../../scripts/migrations/092_rag_ingestion_jobs');
const migration091 = require('../../scripts/migrations/091_rag_core_schema');

// Mock embedding service so we don't actually hit OpenAI
jest.mock('../../src/services/embeddingService', () => ({
  embedChunks: jest.fn()
}));

describe('Retrieval Authorization Boundaries', () => {
  beforeAll(async () => {
    await migration091.up();
    await migration092.up();
  });

  afterAll(async () => {
    await migration092.down();
    await migration091.down();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await sequelize.query('TRUNCATE TABLE knowledge_chunks CASCADE');

    // Setup mock to return a generic embedding
    embeddingService.embedChunks.mockResolvedValue([
      { embedding: Array(1536).fill(0.1) }
    ]);

    // Setup dummy programs and users to satisfy Foreign Key constraints
    try {
      await sequelize.query(`
        INSERT INTO users (id, email, password_hash, role, capabilities, first_name, last_name, languages, created_at, updated_at)
        VALUES 
          ('11111111-1111-1111-1111-11111111111a', 'm1@test.com', 'h', 'mentor', '{"mentor"}', 'M', 'X', '{}', NOW(), NOW()),
          ('11111111-1111-1111-1111-11111111111b', 'm2@test.com', 'h', 'mentor', '{"mentor"}', 'M', 'Y', '{}', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
    } catch(e) {
      console.error('USERS INSERT ERROR:', e.message);
      throw e;
    }

    try {
      await sequelize.query(`
        INSERT INTO programs (id, name, description, type, visibility, total_duration_weeks, created_by, created_at, updated_at)
        VALUES 
          ('00000000-0000-0000-0000-00000000000a', 'Program A', 'desc', 'mentorship', 'public', 4, '11111111-1111-1111-1111-11111111111a', NOW(), NOW()),
          ('00000000-0000-0000-0000-00000000000b', 'Program B', 'desc', 'mentorship', 'public', 4, '11111111-1111-1111-1111-11111111111a', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
    } catch(e) {
      console.error('PROGRAMS INSERT ERROR:', e.message);
      throw e;
    }

    // Create chunks with different scopes using the valid UUIDs we just inserted
    const chunks = [
      { id: '11111111-1111-1111-1111-111111111111', type: 'document', srcId: 'doc1', content: 'public data', vis: 'public', pId: null, mId: null },
      { id: '22222222-2222-2222-2222-222222222222', type: 'document', srcId: 'doc2', content: 'program A data', vis: 'program', pId: '00000000-0000-0000-0000-00000000000a', mId: null },
      { id: '33333333-3333-3333-3333-333333333333', type: 'document', srcId: 'doc3', content: 'highly relevant data secrets module for program B', vis: 'program', pId: '00000000-0000-0000-0000-00000000000b', mId: null },
      { id: '44444444-4444-4444-4444-444444444444', type: 'faq', srcId: 'faq1', content: 'mentor X data secrets module', vis: 'mentor', pId: null, mId: '11111111-1111-1111-1111-11111111111a' },
      { id: '55555555-5555-5555-5555-555555555555', type: 'faq', srcId: 'faq2', content: 'highly relevant mentor Y data secrets module', vis: 'mentor', pId: null, mId: '11111111-1111-1111-1111-11111111111b' },
      { id: '66666666-6666-6666-6666-666666666666', type: 'module', srcId: 'module_unlocked', content: 'unlocked roadmap data secrets module', vis: 'roadmap', pId: null, mId: null },
      { id: '77777777-7777-7777-7777-777777777777', type: 'module', srcId: 'module_locked', content: 'highly relevant locked roadmap data secrets module', vis: 'roadmap', pId: null, mId: null }
    ];

    const vecStr = `[${Array(1536).fill(0.1).join(',')}]`;

    for (const c of chunks) {
      try {
        await sequelize.query(`
          INSERT INTO knowledge_chunks 
          (id, source_type, source_id, source_version, chunk_index, content_hash, content, visibility, program_id, mentor_id, embedding, search_vector, created_at, updated_at)
          VALUES (:id, :type, :srcId, 1, 0, :hash, :content, :vis, :pId, :mId, :emb::vector, to_tsvector('english', :content), NOW(), NOW())
        `, {
          replacements: {
            id: c.id,
            type: c.type,
            srcId: c.srcId,
            hash: c.id,
            content: c.content,
            vis: c.vis,
            pId: c.pId,
            mId: c.mId,
            emb: vecStr
          }
        });
      } catch (err) {
        console.error('INSERT FAILED FOR CHUNK', c.id, err.message);
        throw err;
      }
    }
  });

  it('should only retrieve public data if no context is provided', async () => {
    const results = await retrievalService.retrieveContext({ query: 'data secrets module' });
    
    // Should ONLY return public chunk
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('public data');
  });

  it('should retrieve program A data but NOT program B data when in Program A', async () => {
    const results = await retrievalService.retrieveContext({ 
      query: 'data secrets module',
      programId: '00000000-0000-0000-0000-00000000000a'
    });
    
    // Should return public chunk AND Program A chunk
    expect(results).toHaveLength(2);
    const contents = results.map(r => r.content);
    expect(contents).toContain('public data');
    expect(contents).toContain('program A data');
    
    // STRICT check: No Program B leakage
    expect(contents).not.toContain('highly relevant data secrets module for program B');
  });

  it('should retrieve mentor X data but NOT mentor Y data when acting as Mentor X', async () => {
    const results = await retrievalService.retrieveContext({ 
      query: 'data secrets module',
      mentorId: '11111111-1111-1111-1111-11111111111a'
    });
    
    expect(results).toHaveLength(2);
    const contents = results.map(r => r.content);
    expect(contents).toContain('public data');
    expect(contents).toContain('mentor X data secrets module');
    
    // STRICT check: No Mentor Y leakage
    expect(contents).not.toContain('highly relevant mentor Y data secrets module');
  });

  it('should retrieve unlocked roadmap nodes but NOT locked roadmap nodes', async () => {
    const results = await retrievalService.retrieveContext({ 
      query: 'data secrets module',
      unlockedRoadmapNodeIds: ['module_unlocked']
    });
    
    expect(results).toHaveLength(2);
    const contents = results.map(r => r.content);
    expect(contents).toContain('public data');
    expect(contents).toContain('unlocked roadmap data secrets module');
    
    // STRICT check: No locked node leakage
    expect(contents).not.toContain('highly relevant locked roadmap data secrets module');
  });

  it('should combine multiple scopes correctly', async () => {
    const results = await retrievalService.retrieveContext({ 
      query: 'data secrets module',
      programId: '00000000-0000-0000-0000-00000000000b', // Program B
      mentorId: '11111111-1111-1111-1111-11111111111b', // Mentor Y
      unlockedRoadmapNodeIds: ['module_unlocked']
    });
    
    expect(results).toHaveLength(4);
    const contents = results.map(r => r.content);
    expect(contents).toContain('public data');
    expect(contents).toContain('highly relevant data secrets module for program B');
    expect(contents).toContain('highly relevant mentor Y data secrets module');
    expect(contents).toContain('unlocked roadmap data secrets module');
    
    // Strict omission
    expect(contents).not.toContain('program A data');
    expect(contents).not.toContain('mentor X secrets');
    expect(contents).not.toContain('locked roadmap module');
  });
});
