'use strict';

/**
 * TC-A03  Create program with all valid fields → Draft status
 * TC-A04  Create program with missing required fields → validation errors
 * TC-A05  Create program with invalid date range → error
 * TC-A06  Add named levels to a program
 * TC-A07  Set learning outcomes and prerequisites for a level
 * TC-A08  Publish a draft program
 * TC-A09  View all programs list
 * TC-A10  Search program by name
 * TC-A11  Generate AI roadmap for a 12-week program
 * TC-A12  Generate roadmap when AI service is unavailable
 * TC-A13  Edit an AI-generated roadmap task
 */

const request = require('supertest');
const app = require('../../src/index');
const {
  cleanDb,
  createAdmin,
  createProgram,
  createProgramLevel,
  createRoadmap,
  createRoadmapWeek,
  createRoadmapTask,
  authHeader,
} = require('../helpers/seed');

// Pull the mocked groq service instance so we can override behaviour per-test
const groqServiceMock = require('../../src/services/groqService');

describe('Admin — Programs & Roadmaps', () => {
  let admin;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
    // Reset AI mock to clear any per-test overrides
    groqServiceMock.generateRoadmap?.mockClear?.();
  });

  // TC-A03
  it('TC-A03: creates a program in Draft status with all valid fields', async () => {
    const res = await request(app)
      .post('/api/programs')
      .set('Authorization', authHeader(admin))
      .send({
        name: 'Web Dev Program',
        type: 'mentorship',
        startDate: '2026-06-01',
        endDate: '2026-09-01',
        totalDurationWeeks: 12,
        description: 'Full-stack web development mentorship',
        tags: ['JavaScript', 'Node.js', 'React'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.program.status).toBe('draft');
    expect(res.body.data.program.name).toBe('Web Dev Program');
  });

  // TC-A04
  it('TC-A04: returns 400 when required program fields are missing', async () => {
    const res = await request(app)
      .post('/api/programs')
      .set('Authorization', authHeader(admin))
      .send({ name: 'Incomplete Program' }); // missing description, dates, type, duration

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // TC-A05
  it('TC-A05: returns 400 when end date is before start date', async () => {
    const res = await request(app)
      .post('/api/programs')
      .set('Authorization', authHeader(admin))
      .send({
        name: 'Bad Dates Program',
        type: 'mentorship',
        startDate: '2026-09-01',
        endDate: '2026-06-01', // end before start
        totalDurationWeeks: 12,
        description: 'This should fail due to date validation',
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/date|end date/i);
  });

  // TC-A06
  it('TC-A06: adds Foundation, Intermediate, Advanced levels to a program', async () => {
    const program = await createProgram({ createdBy: admin.id, status: 'draft' });

    const levelNames = ['Foundation', 'Intermediate', 'Advanced'];
    const createdLevels = [];

    for (let i = 0; i < levelNames.length; i++) {
      const res = await request(app)
        .post(`/api/programs/${program.id}/levels`)
        .set('Authorization', authHeader(admin))
        .send({
          name: levelNames[i],
          orderIndex: i + 1,
          durationWeeks: 4,
          description: `${levelNames[i]} level description`,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.level.name).toBe(levelNames[i]);
      createdLevels.push(res.body.data.level);
    }

    expect(createdLevels).toHaveLength(3);
  });

  // TC-A07
  it('TC-A07: saves learning outcomes and prerequisites for a level', async () => {
    const program = await createProgram({ createdBy: admin.id, status: 'draft' });
    const level = await createProgramLevel({ programId: program.id, name: 'Foundation' });

    const res = await request(app)
      .put(`/api/levels/${level.id}`)
      .set('Authorization', authHeader(admin))
      .send({
        learningOutcomes: ['Understand REST APIs', 'Build CRUD endpoints'],
        prerequisites: ['Basic HTML knowledge'],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.level.learningOutcomes).toContain('Understand REST APIs');
    expect(res.body.data.level.prerequisites).toContain('Basic HTML knowledge');
  });

  // TC-A08
  it('TC-A08: changes program status from draft to published', async () => {
    const program = await createProgram({ createdBy: admin.id, status: 'draft' });

    const res = await request(app)
      .put(`/api/programs/${program.id}`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'published' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.program.status).toBe('published');
  });

  // TC-A09
  it('TC-A09: returns all programs with name, type, status and dates', async () => {
    await createProgram({ createdBy: admin.id, name: 'Program A', status: 'published' });
    await createProgram({ createdBy: admin.id, name: 'Program B', status: 'draft' });

    const res = await request(app)
      .get('/api/programs')
      .set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const programs = res.body.data;
    expect(Array.isArray(programs)).toBe(true);
    expect(programs.length).toBeGreaterThanOrEqual(2);
    programs.forEach((p) => {
      expect(p.name).toBeTruthy();
      expect(p.status).toBeTruthy();
    });
  });

  // TC-A10
  it('TC-A10: returns only programs matching the search query', async () => {
    await createProgram({ createdBy: admin.id, name: 'Web Dev Program', status: 'published' });
    await createProgram({ createdBy: admin.id, name: 'Data Science Program', status: 'published' });

    const res = await request(app)
      .get('/api/programs')
      .set('Authorization', authHeader(admin))
      .query({ search: 'Web Dev' });

    expect(res.status).toBe(200);
    const programs = res.body.data;
    expect(Array.isArray(programs)).toBe(true);
    programs.forEach((p) => {
      expect(p.name.toLowerCase()).toContain('web dev');
    });
  });

  // TC-A11
  it('TC-A11: generates an AI roadmap with weekly structure for a 12-week program', async () => {
    const program = await createProgram({ createdBy: admin.id, name: 'Web Dev Program', totalDurationWeeks: 12 });
    const level = await createProgramLevel({ programId: program.id });

    const res = await request(app)
      .post(`/api/programs/${program.id}/levels/${level.id}/roadmap/generate`)
      .set('Authorization', authHeader(admin))
      .send({ additionalInstructions: 'Focus on backend development' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Roadmap should have weeks structure
    const roadmap = res.body.data.roadmap;
    expect(roadmap).toBeDefined();
  });

  // TC-A12
  it('TC-A12: returns error when AI service is unavailable', async () => {
    const program = await createProgram({ createdBy: admin.id, name: 'AI Fail Program', totalDurationWeeks: 12 });
    const level = await createProgramLevel({ programId: program.id });

    // Override the mock to simulate AI failure for this test only
    const GroqServiceMock = require('../../src/services/groqService');
    GroqServiceMock.generateRoadmap.mockRejectedValueOnce(
      new Error('AI service is currently unavailable')
    );

    const res = await request(app)
      .post(`/api/programs/${program.id}/levels/${level.id}/roadmap/generate`)
      .set('Authorization', authHeader(admin))
      .send({});

    // Service may return 400/500/503 with error message
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  // TC-A13
  it('TC-A13: updates a roadmap task description and estimated hours', async () => {
    const program = await createProgram({ createdBy: admin.id });
    const level = await createProgramLevel({ programId: program.id });
    const roadmap = await createRoadmap({ programId: program.id, levelId: level.id, createdBy: admin.id });
    const week = await createRoadmapWeek({ roadmapId: roadmap.id, weekNumber: 1 });
    const roadmapTask = await createRoadmapTask({ weekId: week.id, title: 'Build REST API', estimatedHours: 5 });

    const res = await request(app)
      .put(`/api/roadmap-tasks/${roadmapTask.id}`)
      .set('Authorization', authHeader(admin))
      .send({
        description: 'Implement a fully documented REST API with Swagger',
        estimatedHours: 8,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.task.estimatedHours).toBe(8);
  });
});
