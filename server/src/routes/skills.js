const express = require('express');
const router = express.Router();
const skillController = require('../controllers/skillController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * @route   GET /api/skills
 * @desc    Get all skills (with optional filters)
 * @access  Private
 */
router.get('/', authenticate, skillController.getAllSkills);

/**
 * @route   GET /api/skills/categories
 * @desc    Get all skill categories
 * @access  Private
 */
router.get('/categories', authenticate, skillController.getCategories);

/**
 * @route   GET /api/skills/user
 * @desc    Get current user's skills
 * @access  Private
 */
router.get('/user', authenticate, skillController.getUserSkills);

/**
 * @route   POST /api/skills
 * @desc    Create new skill (admin only)
 * @access  Private (Admin only)
 */
router.post('/', authenticate, authorize('admin'), skillController.createSkill);

module.exports = router;
