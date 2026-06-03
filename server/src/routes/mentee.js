const express = require('express');
const router = express.Router();
const cohortController = require('../controllers/cohortController');
const dailyLogController = require('../controllers/dailyLogController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * Mentee-area routes — scoped to the logged-in mentee (distinct from the
 * admin-facing /mentees directory listing).
 */

// The mentee's own fairness read for the "My Progress" page.
router.get('/progress', authenticate, authorize(['mentee', 'admin']), cohortController.getMyProgress);

// Daily check-in log.
router.get('/daily-log', authenticate, authorize(['mentee', 'admin']), dailyLogController.getMyDailyLogs);
router.post('/daily-log', authenticate, authorize(['mentee', 'admin']), dailyLogController.saveMyDailyLog);

module.exports = router;
