const express = require('express');
const router = express.Router();
const certificateController = require('./controllers/certificateController');
const { authenticate, authorize } = require('../../middlewares/auth');
const upload = require('../../middlewares/upload');

/**
 * @route   POST /api/certificates/templates
 * @desc    Create a new certificate template
 * @access  Admin
 */
router.post(
  '/templates',
  authenticate,
  authorize(['admin']),
  certificateController.createTemplate
);

/**
 * @route   GET /api/certificates/templates
 * @desc    List all active certificate templates
 * @access  Admin, Mentor
 */
router.get(
  '/templates',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.listTemplates
);

/**
 * @route   GET /api/certificates/templates/:id
 * @desc    Get details of a single certificate template
 * @access  Admin, Mentor
 */
router.get(
  '/templates/:id',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getTemplate
);

/**
 * @route   GET /api/certificates/templates/:id/qualification
 * @desc    Evaluate mentee eligibility criteria for a cohort
 * @access  Admin, Mentor
 */
router.get(
  '/templates/:id/qualification',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getQualification
);

/**
 * @route   PUT /api/certificates/templates/:id
 * @desc    Update an existing template's configuration
 * @access  Admin
 */
router.put(
  '/templates/:id',
  authenticate,
  authorize(['admin']),
  certificateController.updateTemplate
);

/**
 * @route   DELETE /api/certificates/templates/:id
 * @desc    Archive/delete a certificate template
 * @access  Admin
 */
router.delete(
  '/templates/:id',
  authenticate,
  authorize(['admin']),
  certificateController.deleteTemplate
);

/**
 * @route   POST /api/certificates/instances
 * @desc    Issue certificates to one or more mentees
 * @access  Admin, Mentor
 */
router.post(
  '/instances',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.issueCertificates
);

/**
 * @route   GET /api/certificates/instances/mentee/:menteeId
 * @desc    List all certificates awarded to a specific mentee
 * @access  Admin, Mentor, Mentee (own only)
 */
router.get(
  '/instances/mentee/:menteeId',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  certificateController.listMenteeCertificates
);

/**
 * @route   GET /api/certificates/instances/:id
 * @desc    Get details of a single certificate instance
 * @access  Admin, Mentor, Mentee (own only)
 */
router.get(
  '/instances/:id',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  certificateController.getCertificateInstance
);

/**
 * @route   POST /api/certificates/upload
 * @desc    Upload an asset (Background image or logo) to Cloudinary
 * @access  Admin
 */
router.post(
  '/upload',
  authenticate,
  authorize(['admin']),
  upload.singleSafe('file'),
  certificateController.uploadAsset
);

/**
 * @route   POST /api/certificates/templates/:id/send-to-mentors
 * @desc    Send template notification to all mentors in a program
 * @access  Admin
 */
router.post(
  '/templates/:id/send-to-mentors',
  authenticate,
  authorize(['admin']),
  certificateController.sendToMentors
);

/**
 * @route   GET /api/certificates/templates/:id/history
 * @desc    Get details of certificates issued for a template
 * @access  Admin, Mentor
 */
router.get(
  '/templates/:id/history',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getTemplateHistory
);

/**
 * @route   DELETE /api/certificates/instances/:id
 * @desc    Delete/revoke a certificate instance
 * @access  Admin, Mentor
 */
router.delete(
  '/instances/:id',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.deleteCertificateInstance
);

/**
 * @route   POST /api/certificates/instances/:id/resend
 * @desc    Regenerate/resend a certificate instance
 * @access  Admin, Mentor
 */
router.post(
  '/instances/:id/resend',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.resendCertificateInstance
);

/**
 * @route   DELETE /api/certificates/templates/:id/instances
 * @desc    Revoke and delete all certificate instances for a template
 * @access  Admin, Mentor
 */
router.delete(
  '/templates/:id/instances',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.revokeAllTemplateCertificates
);

/**
 * @route   POST /api/certificates/templates/:id/resend
 * @desc    Regenerate all or failed certificates for a template
 * @access  Admin, Mentor
 */
router.post(
  '/templates/:id/resend',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.resendAllTemplateCertificates
);

module.exports = router;
