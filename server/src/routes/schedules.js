const express = require('express');
const router = express.Router();
const c = require('../controllers/scheduleTemplateController');
const { authenticate, authorize } = require('../middlewares/auth');

const mentorOnly = [authenticate, authorize(['mentor', 'admin'])];

// Templates (mentor).
router.get('/templates', mentorOnly, c.listTemplates);
router.post('/templates', mentorOnly, c.createTemplate);
router.post('/templates/import', mentorOnly, c.importTemplate);
router.patch('/templates/:id', mentorOnly, c.updateTemplate);
router.delete('/templates/:id', mentorOnly, c.deleteTemplate);
router.post('/templates/:id/assign', mentorOnly, c.assign);

// Per-mentee schedule.
router.get('/me', authenticate, c.getMySchedule);                 // mentee's own
router.get('/mentee/:id', mentorOnly, c.getMenteeSchedule);       // mentor viewing a mentee
router.patch('/mentee/:id/slot/:slotId', mentorOnly, c.updateSlot); // fill a slot

module.exports = router;
