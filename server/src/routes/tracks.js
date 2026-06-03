const express = require('express');
const router = express.Router();
const c = require('../controllers/trackController');
const { authenticate, authorize } = require('../middlewares/auth');

const mentorOnly = [authenticate, authorize(['mentor', 'admin'])];

// Per-mentee lanes (mentor-curated).
router.get('/mentee/:menteeId', mentorOnly, c.listForMentee);
router.post('/mentee/:menteeId', mentorOnly, c.create);
router.patch('/mentee/:menteeId/reorder', mentorOnly, c.reorder);

router.patch('/:id', mentorOnly, c.rename);
router.patch('/:id/archive', mentorOnly, c.setArchived);
router.delete('/:id', mentorOnly, c.remove);
router.post('/:id/tasks', mentorOnly, c.addTask);

// Move an existing task into / out of a track.
router.patch('/task/:taskId', mentorOnly, c.setTaskTrack);

module.exports = router;
