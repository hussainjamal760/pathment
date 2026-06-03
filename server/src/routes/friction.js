const express = require('express');
const router = express.Router();
const frictionController = require('../controllers/frictionController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * Blockers and delay events (mounted at root: /api/blockers, /api/delays).
 * Any authenticated user may list/create against their own/their mentees'
 * records; accepting a delay is a mentor/admin action.
 */

// Blockers
router.get('/blockers', authenticate, frictionController.listBlockers);
router.post('/blockers', authenticate, frictionController.createBlocker);
router.patch('/blockers/:id/resolve', authenticate, frictionController.resolveBlocker);

// Delays
router.get('/delays', authenticate, frictionController.listDelays);
router.post('/delays', authenticate, frictionController.createDelay);
router.patch('/delays/:id/accept', authenticate, authorize(['mentor', 'admin']), frictionController.acceptDelay);

module.exports = router;
