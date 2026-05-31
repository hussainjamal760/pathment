const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const taskTemplateController = require('../controllers/taskTemplateController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * @route   POST /api/tasks/auto-assign
 * @desc    Auto-assign roadmap tasks for a week
 * @access  Admin, Mentor
 */
router.post(
  '/auto-assign',
  authenticate,
  authorize(['admin', 'mentor']),
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
  authorize(['mentor']),
  taskController.createCustomTask
);

router.post(
  '/templates',
  authenticate,
  authorize(['mentor']),
  taskTemplateController.createTemplate
);

router.get(
  '/templates',
  authenticate,
  authorize(['mentor']),
  taskTemplateController.getTemplates
);

router.put(
  '/templates/:id',
  authenticate,
  authorize(['mentor']),
  taskTemplateController.updateTemplate
);

router.delete(
  '/templates/:id',
  authenticate,
  authorize(['mentor']),
  taskTemplateController.deleteTemplate
);

router.post(
  '/templates/:id/assign',
  authenticate,
  authorize(['mentor']),
  taskTemplateController.assignTemplate
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
  '/roadmap/program/:programId/level/:levelId',
  authenticate,
  authorize(['admin', 'mentor']),
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
  authorize(['mentor', 'admin']),
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
  authorize(['admin', 'mentor']),
  taskController.cancelTask
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
 * @route   DELETE /api/tasks/:taskId
 * @desc    Delete custom task
 * @access  Mentor
 */
router.delete(
  '/:taskId',
  authenticate,
  authorize(['mentor', 'admin']),
  taskController.deleteCustomTask
);

module.exports = router;
