const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission, requirePermissionAnyScope, scope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

/**
 * @route   POST /api/tasks/auto-assign
 * @desc    Auto-assign roadmap tasks for a week
 * @access  Admin, Mentor
 */
router.post(
  '/auto-assign',
  authenticate,
  requirePermission(PERMISSIONS.TASK_ASSIGN, scope.taskTarget()),
  taskController.autoAssignWeekTasks
);

/**
 * @route   POST /api/tasks/custom
 * @desc    Create custom task
 * @access  Mentor
 */
router.post(
  '/custom',
  authenticate,
  requirePermission(PERMISSIONS.TASK_ASSIGN, scope.taskTarget()),
  taskController.createCustomTask
);

/**
 * @route   POST /api/tasks/custom/bulk
 * @desc    Assign one custom task to many mentees
 * @access  Mentor
 */
router.post(
  '/custom/bulk',
  authenticate,
  requirePermissionAnyScope(PERMISSIONS.TASK_ASSIGN),
  taskController.bulkCreateCustomTasks
);

/**
 * @route   GET /api/tasks/mentee/:menteeId/stats
 * @desc    Get task statistics for mentee
 * @access  Admin, Mentor, Mentee (own only)
 */
router.get(
  '/mentee/:menteeId/stats',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  taskController.getMenteeTaskStats
);

/**
 * @route   GET /api/tasks/mentee/:menteeId
 * @desc    Get tasks for a mentee
 * @access  Admin, Mentor, Mentee (own only)
 */
router.get(
  '/mentee/:menteeId',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  taskController.getMenteeTasks
);

/**
 * @route   GET /api/tasks/mentor/:mentorId/stats
 * @desc    Get task statistics for mentor
 * @access  Admin, Mentor (own only)
 */
router.get(
  '/mentor/:mentorId/stats',
  authenticate,
  authorize(['admin', 'mentor']),
  taskController.getMentorTaskStats
);

/**
 * @route   GET /api/tasks/mentor/:mentorId
 * @desc    Get tasks for a mentor (to review)
 * @access  Admin, Mentor (own only)
 */
router.get(
  '/mentor/:mentorId',
  authenticate,
  authorize(['admin', 'mentor']),
  taskController.getMentorTasks
);

/**
 * @route   GET /api/tasks/:taskId
 * @desc    Get single task by ID
 * @access  Admin, Mentor, Mentee (assigned only)
 */
router.get(
  '/:taskId',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  taskController.getTaskById
);

/**
 * @route   POST /api/tasks/:taskId/submit
 * @desc    Submit task
 * @access  Mentee
 */
router.post(
  '/:taskId/submit',
  authenticate,
  authorize(['mentee']),
  taskController.submitTask
);

/**
 * @route   GET /api/tasks/roadmap/program/:programId/level/:levelId
 * @desc    Get roadmap tasks for a program level
 * @access  Admin, Mentor
 */
router.get(
  '/roadmap/program/:programId',
  authenticate,
  requirePermissionAnyScope(PERMISSIONS.TASK_ASSIGN),
  taskController.getRoadmapTasks
);

/**
 * @route   POST /api/tasks/:taskId/review
 * @desc    Review task submission
 * @access  Mentor
 */
router.post(
  '/:taskId/review',
  authenticate,
  requirePermission(PERMISSIONS.TASK_REVIEW, scope.task('taskId')),
  taskController.reviewTask
);

/**
 * @route   POST /api/tasks/:taskId/cancel
 * @desc    Cancel a task
 * @access  Admin, Mentor
 */
router.post(
  '/:taskId/cancel',
  authenticate,
  requirePermission(PERMISSIONS.TASK_ASSIGN, scope.task('taskId')),
  taskController.cancelTask
);

/**
 * @route   PATCH /api/tasks/:taskId   — edit a mentee's assigned task (overrides + note + due date)
 * @route   POST  /api/tasks/:taskId/reassign — reactivate a cancelled task
 * @access  Mentor of the task's clan / Admin
 */
router.patch(
  '/:taskId',
  authenticate,
  requirePermission(PERMISSIONS.TASK_ASSIGN, scope.task('taskId')),
  taskController.updateAssignedTask
);
router.post(
  '/:taskId/reassign',
  authenticate,
  requirePermission(PERMISSIONS.TASK_ASSIGN, scope.task('taskId')),
  taskController.reassignTask
);

/**
 * @route   PATCH /api/tasks/:taskId/status
 * @desc    Update task status
 * @access  Admin, Mentor, Mentee
 */
router.patch(
  '/:taskId/status',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  taskController.updateTaskStatus
);

/**
 * @route   PATCH /api/tasks/:taskId/due-date
 * @desc    Change an assigned task's deadline
 * @access  Admin, Mentor
 */
router.patch(
  '/:taskId/due-date',
  authenticate,
  requirePermission(PERMISSIONS.TASK_ASSIGN, scope.task('taskId')),
  taskController.updateTaskDueDate
);

/**
 * @route   POST /api/tasks/:taskId/unassign
 * @desc    Unassign (delete) an assigned task — roadmap or custom
 * @access  Admin, Mentor
 */
router.post(
  '/:taskId/unassign',
  authenticate,
  requirePermission(PERMISSIONS.TASK_ASSIGN, scope.task('taskId')),
  taskController.unassignTask
);

/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    Delete custom task
 * @access  Mentor
 */
router.delete(
  '/:taskId',
  authenticate,
  requirePermission(PERMISSIONS.TASK_ASSIGN, scope.task('taskId')),
  taskController.deleteCustomTask
);

module.exports = router;
