'use strict';

/**
 * A generic "Submit Work" submission must never attach to an interview or quiz
 * task — those are completed only through their own runners. This is the
 * server-authoritative guard (a stale client / bookmarked submit page can't
 * bypass it), which stops stray text submissions piling onto an interview.
 */

const { models } = require('../../src/db');
const submissionService = require('../../src/services/submissionService');
const { cleanDb, createMentor, createMentee } = require('../helpers/seed');

describe('submitTaskWithFiles task-type guard', () => {
  let mentee, mentor;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'mentor@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });
  });

  const makeTask = async (type) => {
    const rt = await models.RoadmapTask.create(
      { title: 'Frontend Interview', description: 'x', type, difficulty: 'medium', taskOrder: 1, deliverable: 'x' },
      { validate: false }
    );
    return models.AssignedTask.create(
      { menteeId: mentee.id, mentorId: mentor.id, roadmapTaskId: rt.id, status: 'revision_needed' },
      { validate: false }
    );
  };

  it('rejects a generic submission on an interview task', async () => {
    const task = await makeTask('interview');
    await expect(
      submissionService.submitTaskWithFiles(task.id, mentee.id, { submissionText: 'let me explain the bug' }, [])
    ).rejects.toThrow(/interview/i);
    // Nothing was written.
    expect(await models.TaskSubmission.count({ where: { assignedTaskId: task.id } })).toBe(0);
  });

  it('rejects a generic submission on a quiz task', async () => {
    const task = await makeTask('quiz');
    await expect(
      submissionService.submitTaskWithFiles(task.id, mentee.id, { submissionText: 'hi' }, [])
    ).rejects.toThrow(/quiz/i);
    expect(await models.TaskSubmission.count({ where: { assignedTaskId: task.id } })).toBe(0);
  });

  it('still accepts a generic submission on a normal task', async () => {
    const task = await makeTask('project');
    const res = await submissionService.submitTaskWithFiles(task.id, mentee.id, { submissionText: 'my work' }, []);
    expect(res).toBeTruthy();
    expect(await models.TaskSubmission.count({ where: { assignedTaskId: task.id } })).toBe(1);
  });
});
