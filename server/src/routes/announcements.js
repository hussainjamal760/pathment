const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { authenticate, authorize } = require('../middlewares/auth');

// Anyone authenticated can read announcements + react.
router.get('/', authenticate, announcementController.list);
router.post('/:id/react', authenticate, announcementController.react);

// Admins compose / pin / remove.
router.post('/', authenticate, authorize(['admin']), announcementController.create);
router.patch('/:id/pin', authenticate, authorize(['admin']), announcementController.togglePin);
router.delete('/:id', authenticate, authorize(['admin']), announcementController.remove);

module.exports = router;
