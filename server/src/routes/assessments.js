const express = require('express');
const router = express.Router();
const assessmentController = require('../controllers/assessmentController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

// Assessment authoring requires assessment.author (super_admin, intake_manager,
// program_admin). Org-scoped check - no per-resource scope needed here.
const canAuthor = [authenticate, requirePermission(PERMISSIONS.ASSESSMENT_AUTHOR)];

router.get('/', ...canAuthor, assessmentController.listAssessments);
router.post('/', ...canAuthor, assessmentController.createAssessment);
router.get('/:id', ...canAuthor, assessmentController.getAssessment);
router.patch('/:id', ...canAuthor, assessmentController.updateAssessment);
router.put('/:id/questions', ...canAuthor, assessmentController.setQuestions);
router.delete('/:id', ...canAuthor, assessmentController.deleteAssessment);

module.exports = router;
