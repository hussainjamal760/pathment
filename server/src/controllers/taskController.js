const taskService = require('../services/taskService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Auto-assign week tasks to mentee
 * POST /api/tasks/auto-assign
 */
exports.autoAssignWeekTasks = catchAsync(async (req, res) => {
  const { enrollmentId, weekNumber } = req.body;
  
  const result = await taskService.autoAssignWeekTasks(enrollmentId, weekNumber);
  res.status(201).json(successResponse('Tasks auto-assigned successfully', result, 201));
});

/**
 * Create custom task (mentor creates for mentee)
 * POST /api/tasks/custom
 */
exports.createCustomTask = catchAsync(async (req, res) => {
  const mentorId = req.user.id;
  
  if (req.body.mentees && Array.isArray(req.body.mentees) && req.body.mentees.length > 0) {
    const results = {
      successful: [],
      failed: []
    };
    for (const mentee of req.body.mentees) {
      try {
        const task = await taskService.createCustomTask({
          ...req.body,
          menteeId: mentee.menteeId,
          enrollmentId: mentee.enrollmentId
        }, mentorId);
        results.successful.push({ menteeId: mentee.menteeId, taskId: task.assignedTasks?.[0]?.id });
      } catch (error) {
        results.failed.push({ menteeId: mentee.menteeId, reason: error.message });
      }
    }
    return res.status(201).json(successResponse('Custom tasks creation completed', results, 201));
  } else {
    const task = await taskService.createCustomTask(req.body, mentorId);
    return res.status(201).json(successResponse('Custom task created successfully', { task }, 201));
  }
});

/**
 * Get tasks for mentee
 * GET /api/tasks/mentee/:menteeId
 */
exports.getMenteeTasks = catchAsync(async (req, res) => {
  const { menteeId } = req.params;
  const { status, enrollmentId, isCustomTask } = req.query;
  
  // Security: Mentees can only view their own tasks
  if (req.user.role === 'mentee' && req.user.id !== menteeId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  
  const tasks = await taskService.getMenteeTasks(menteeId, {
    status,
    enrollmentId,
    isCustomTask: isCustomTask === 'true' ? true : isCustomTask === 'false' ? false : undefined
  });
  
  res.status(200).json(successResponse('Tasks retrieved', { tasks }));
});

/**
 * Get tasks for mentor (to review)
 * GET /api/tasks/mentor/:mentorId
 */
exports.getMentorTasks = catchAsync(async (req, res) => {
  const { mentorId } = req.params;
  const { status, enrollmentId, menteeId, pendingReview } = req.query;
  
  // Security: Mentors can only view their own tasks
  if (req.user.role === 'mentor' && req.user.id !== mentorId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  
  const tasks = await taskService.getMentorTasks(mentorId, {
    status,
    enrollmentId,
    menteeId,
    pendingReview: pendingReview === 'true'
  });
  
  res.status(200).json(successResponse('Tasks retrieved', { tasks }));
});

/**
 * Get single assigned task by ID
 * GET /api/tasks/:taskId
 */
exports.getTaskById = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  
  const task = await taskService.getAssignedTaskById(taskId);
  
  // Security check
  if (req.user.role === 'mentee' && task.menteeId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  if (req.user.role === 'mentor' && task.mentorId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  
  res.status(200).json(successResponse('Task retrieved', { task }));
});

/**
 * Submit task
 * POST /api/tasks/:taskId/submit
 */
exports.submitTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const menteeId = req.user.id;
  
  const task = await taskService.submitTask(taskId, menteeId, req.body);
  res.status(200).json(successResponse('Task submitted successfully', { task }));
});

/**
 * Review task submission
 * POST /api/tasks/:taskId/review
 */
exports.reviewTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const mentorId = req.user.id;
  
  const task = await taskService.reviewTask(taskId, mentorId, req.body);
  res.status(200).json(successResponse('Task reviewed successfully', { task }));
});

/**
 * Update task status
 * PATCH /api/tasks/:taskId/status
 */
exports.updateTaskStatus = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const { status } = req.body;
  
  const task = await taskService.updateTaskStatus(taskId, req.user.id, req.user.role, status);
  res.status(200).json(successResponse('Task status updated', { task }));
});

/**
 * Get mentor task statistics
 * GET /api/tasks/mentor/:mentorId/stats
 */
exports.getMentorTaskStats = catchAsync(async (req, res) => {
  const { mentorId } = req.params;
  
  console.log('getMentorTaskStats - User role:', req.user.role, 'User ID:', req.user.id, 'Mentor ID:', mentorId);
  
  // Security: Mentors can only view their own stats
  if (req.user.role === 'mentor' && req.user.id !== mentorId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  
  const stats = await taskService.getMentorTaskStats(mentorId);
  res.status(200).json(successResponse('Stats retrieved', { stats }));
});

/**
 * Get mentee task statistics
 * GET /api/tasks/mentee/:menteeId/stats
 */
exports.getMenteeTaskStats = catchAsync(async (req, res) => {
  const { menteeId } = req.params;
  const { enrollmentId } = req.query;
  
  // Security: Mentees can only view their own stats
  if (req.user.role === 'mentee' && req.user.id !== menteeId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  
  const stats = await taskService.getMenteeTaskStats(menteeId, enrollmentId);
  res.status(200).json(successResponse('Stats retrieved', { stats }));
});

/**
 * Cancel a task
 * POST /api/tasks/:taskId/cancel
 */
exports.cancelTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  
  const task = await taskService.cancelTask(taskId, userId, userRole, reason);
  res.status(200).json(successResponse('Task cancelled successfully', { task }));
});

/**
 * Get roadmap tasks for a program level
 * GET /api/tasks/roadmap/program/:programId/level/:levelId?menteeId=xxx
 */
exports.getRoadmapTasks = catchAsync(async (req, res) => {
  const { programId, levelId } = req.params;
  const { menteeId } = req.query; // Optional menteeId to check assignment status
  
  const roadmap = await taskService.getRoadmapTasks(programId, levelId, menteeId);
  res.status(200).json(successResponse('Roadmap retrieved', { roadmap }));
});

/**
 * Delete custom task
 * DELETE /api/tasks/:taskId
 */
exports.deleteCustomTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const mentorId = req.user.id;
  
  const result = await taskService.deleteCustomTask(taskId, mentorId);
  res.status(200).json(successResponse(result.message, {}));
});

module.exports = exports;
