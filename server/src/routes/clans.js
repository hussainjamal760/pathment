const express = require('express');
const router = express.Router();
const clanController = require('../controllers/clanController');
const { authenticate, authorize } = require('../middlewares/auth');

// Current user's clan memberships (any authenticated role).
router.get('/me/memberships', authenticate, clanController.myMemberships);

// Programs the current mentor runs (their clans + roster counts).
router.get('/mentor/programs', authenticate, authorize(['mentor', 'admin']), clanController.mentorPrograms);

// List clans (any authenticated user; filterable by program/status).
router.get('/', authenticate, clanController.listClans);

// Org-wide clan-health snapshot grouped by program (admin dashboard).
router.get('/health', authenticate, authorize(['admin']), clanController.clanHealth);

// Clan detail.
router.get('/:id', authenticate, clanController.getClan);

// Create a clan (admin).
router.post('/', authenticate, authorize(['admin']), clanController.createClan);

// Update a clan (admin or mentor — lead-mentor ownership checked in service later).
router.patch('/:id', authenticate, authorize(['admin', 'mentor']), clanController.updateClan);

// Manage members (admin or mentor).
router.post('/:id/members', authenticate, authorize(['admin', 'mentor']), clanController.addMember);
router.delete('/:id/members/:userId', authenticate, authorize(['admin', 'mentor']), clanController.removeMember);

module.exports = router;
