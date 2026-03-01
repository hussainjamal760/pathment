const express = require('express');
const router = express.Router();
const matchingController = require('../controllers/matchingController');
const { authenticate, authorize } = require('../middlewares/auth');

router.post('/', authenticate, authorize(['admin']), matchingController.createMatch);
router.post('/auto-match', authenticate, authorize(['admin']), matchingController.autoMatchPending);
router.get('/suggestions/:enrollmentId', authenticate, authorize(['admin']), matchingController.getAISuggestions);
router.get('/levels/:levelId/mentors', authenticate, matchingController.getLevelMentors);
router.get('/mentor-levels', authenticate, matchingController.getMentorAssignedLevels);
router.get('/', authenticate, matchingController.getMatches);
router.patch('/:id/status', authenticate, matchingController.updateMatchStatus);

module.exports = router;
