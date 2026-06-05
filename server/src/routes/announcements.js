const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { authenticate, authorize } = require('../middlewares/auth');

// Anyone authenticated can read announcements (scoped to them) + react.
router.get('/', authenticate, announcementController.list);
router.post('/:id/react', authenticate, announcementController.react);

// Clans the logged-in mentor leads (compose dropdown).
router.get('/led-clans', authenticate, authorize(['mentor', 'admin']), announcementController.myLedClans);

// Admins + mentors compose (the service authorizes WHAT each may target).
router.post('/', authenticate, authorize(['admin', 'mentor']), announcementController.create);
// Pin / remove - admin or the author (enforced in the service).
router.patch('/:id/pin', authenticate, authorize(['admin', 'mentor']), announcementController.togglePin);
router.delete('/:id', authenticate, authorize(['admin', 'mentor']), announcementController.remove);

module.exports = router;
