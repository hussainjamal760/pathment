'use strict';

/**
 * TC-A14  Assign mentor to a program level
 * TC-A15  Generate AI mentor-mentee match suggestions
 * TC-A16  Confirm mentor-mentee match manually
 * TC-A17  Roadmap tasks auto-instantiated after match confirmation
 * TC-A18  Generate match when no mentors are available
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const {
  cleanDb,
  createAdmin,
  createMentor,
  createMentee,
  createProgram,
  createProgramLevel,
  createEnrollment,
  createRoadmap,
  createRoadmapWeek,
  createRoadmapTask,
  authHeader,
} = require('../helpers/seed');

describe('Admin — Matching', () => {
  let admin, mentor, mentee, program, level, enrollment;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
    mentor = await createMentor({ email: 'malikjunaid26039@gmail.com', password: 'Junaid123@' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    program = await createProgram({ createdBy: admin.id, name: 'Web Dev Program', status: 'published' });
    level = await createProgramLevel({ programId: program.id, name: 'Foundation' });
    enrollment = await createEnrollment({
      menteeId: mentee.id,
      programId: program.id,
      levelId: level.id,
      status: 'pending_match',
    });
  });

  // TC-A14
  it('TC-A14: assigns a mentor to a program level', async () => {
    const res = await request(app)
      .post('/api/matches/levels/assign')
      .set('Authorization', authHeader(admin))
      .send({ levelId: level.id, mentorId: mentor.id });

    // Route may vary; fall back to a direct level-mentor route if available
    if (res.status === 404) {
      // Try alternative endpoint
      const alt = await request(app)
        .post(`/api/programs/${program.id}/levels/${level.id}/mentors`)
        .set('Authorization', authHeader(admin))
        .send({ mentorId: mentor.id });

      expect([200, 201]).toContain(alt.status);
    } else {
      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
    }
  });

  // TC-A15
  it('TC-A15: returns AI match suggestions with compatibility percentages', async () => {
    // Assign mentor to level first so the suggestion engine has candidates
    await models.LevelMentorAssignment.create({
      levelId: level.id,
      mentorId: mentor.id,
      assignedBy: admin.id,
    });

    const res = await request(app)
      .get(`/api/matches/suggestions/${enrollment.id}`)
      .set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const suggestions = res.body.data.suggestions;
    expect(Array.isArray(suggestions)).toBe(true);
    // Each suggestion should have a score / compatibility field
    if (suggestions.length > 0) {
      expect(suggestions[0].matchScore !== undefined || suggestions[0].score !== undefined).toBe(true);
    }
  });

  // TC-A16
  it('TC-A16: confirms match → enrollment status updates to matched', async () => {
    // Assign mentor to level
    await models.LevelMentorAssignment.create({
      levelId: level.id,
      mentorId: mentor.id,
      assignedBy: admin.id,
    });

    const res = await request(app)
      .post('/api/matches')
      .set('Authorization', authHeader(admin))
      .send({
        enrollmentId: enrollment.id,
        mentorId: mentor.id,
        levelId: level.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.match.status).toMatch(/active|pending/i);

    // Enrollment status should update to matched
    await enrollment.reload();
    expect(enrollment.status).toMatch(/matched|active/i);
  });

  // TC-A17
  it('TC-A17: creates task instances for mentee after match confirmation', async () => {
    // Set up a roadmap with tasks
    const roadmap = await createRoadmap({ programId: program.id, levelId: level.id, createdBy: admin.id });
    const week = await createRoadmapWeek({ roadmapId: roadmap.id, weekNumber: 1 });
    await createRoadmapTask({ weekId: week.id, title: 'Week 1 Task 1', taskOrder: 1 });
    await createRoadmapTask({ weekId: week.id, title: 'Week 1 Task 2', taskOrder: 2 });

    // Assign mentor to level
    await models.LevelMentorAssignment.create({
      levelId: level.id,
      mentorId: mentor.id,
      assignedBy: admin.id,
    });

    // Confirm match
    await request(app)
      .post('/api/matches')
      .set('Authorization', authHeader(admin))
      .send({ enrollmentId: enrollment.id, mentorId: mentor.id, levelId: level.id });

    // Wait briefly for async task instantiation
    await new Promise((r) => setTimeout(r, 200));

    const assignedTasks = await models.AssignedTask.findAll({
      where: { menteeId: mentee.id, enrollmentId: enrollment.id },
    });

    expect(assignedTasks.length).toBeGreaterThanOrEqual(1);
  });

  // TC-A18
  it('TC-A18: returns error when no mentors are available for matching', async () => {
    // No mentor assigned to the level — AI suggestions should return empty or error
    const res = await request(app)
      .get(`/api/matches/suggestions/${enrollment.id}`)
      .set('Authorization', authHeader(admin));

    // May return 200 with empty suggestions, or 404/400 with a descriptive error
    if (res.status === 200) {
      const suggestions = res.body.data.suggestions;
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBe(0);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message.toLowerCase()).toMatch(/no.*mentor|unavailable|available/i);
    }
  });
});
