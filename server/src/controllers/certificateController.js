const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const certificateService = require('../services/certificateService');

/**
 * Create a new certificate template (Admin only)
 */
const createTemplate = catchAsync(async (req, res) => {
  const template = await certificateService.createTemplate(req.body, req.user.id);
  res.status(201).json(successResponse('Certificate template created successfully', template, 201));
});

/**
 * List all certificate templates (Admin & Mentor)
 */
const listTemplates = catchAsync(async (req, res) => {
  const templates = await certificateService.listTemplates(req.query.programId, req.user);
  res.status(200).json(successResponse('Certificate templates retrieved', templates));
});

/**
 * Get single template details
 */
const getTemplate = catchAsync(async (req, res) => {
  const template = await certificateService.getTemplate(req.params.id);
  res.status(200).json(successResponse('Certificate template details', template));
});

/**
 * Update an existing template (Admin only)
 */
const updateTemplate = catchAsync(async (req, res) => {
  const template = await certificateService.updateTemplate(req.params.id, req.body);
  res.status(200).json(successResponse('Certificate template updated successfully', template));
});

/**
 * Archive/Delete a template (Admin only)
 */
const deleteTemplate = catchAsync(async (req, res) => {
  await certificateService.deleteTemplate(req.params.id);
  res.status(200).json(successResponse('Certificate template deleted successfully'));
});

/**
 * Issue certificates to one or more mentees (Admin or Mentor)
 */
const issueCertificates = catchAsync(async (req, res) => {
  const result = await certificateService.issueCertificates(req.body, req.user.id);
  res.status(201).json(successResponse(`Enqueued ${result.count} certificate(s) for generation`, result, 201));
});

/**
 * List all certificates awarded to a specific mentee
 */
const listMenteeCertificates = catchAsync(async (req, res) => {
  const certificates = await certificateService.listMenteeCertificates(req.params.menteeId, req.user);
  res.status(200).json(successResponse('Mentee certificates retrieved', certificates));
});

/**
 * Get details of a single certificate instance
 */
const getCertificateInstance = catchAsync(async (req, res) => {
  const instance = await certificateService.getCertificateInstance(req.params.id, req.user);
  res.status(200).json(successResponse('Certificate details retrieved', instance));
});

/**
 * Upload an asset (Background image or logo) to Cloudinary (Admin only)
 */
const uploadAsset = catchAsync(async (req, res) => {
  const url = await certificateService.uploadAsset(req.file?.buffer);
  res.status(200).json(successResponse('Asset uploaded successfully', { url }));
});

/**
 * Evaluate qualification per tier with enriched mentee data
 */
const getQualification = catchAsync(async (req, res) => {
  const result = await certificateService.getQualification(req.params.id, req.query.mentorId, req.user);
  res.status(200).json(successResponse('Qualification calculation complete', result));
});

/**
 * Send template notification to all mentors in a program
 */
const sendToMentors = catchAsync(async (req, res) => {
  const result = await certificateService.sendToMentors(req.params.id);
  if (result.sent === 0) {
    return res.status(200).json(successResponse('No active mentors found in this program.', { sent: 0 }));
  }
  res.status(200).json(successResponse(`Sent to ${result.sent} mentor(s).`, result));
});

/**
 * Get history of certificates issued for a template
 */
const getTemplateHistory = catchAsync(async (req, res) => {
  const history = await certificateService.getTemplateHistory(req.params.id, req.user);
  res.status(200).json(successResponse('Template history retrieved', history));
});

/**
 * Delete / Revoke a certificate instance
 */
const deleteCertificateInstance = catchAsync(async (req, res) => {
  await certificateService.deleteCertificateInstance(req.params.id);
  res.status(200).json(successResponse('Certificate instance deleted/revoked successfully'));
});

/**
 * Queue a certificate instance for regeneration/resend
 */
const resendCertificateInstance = catchAsync(async (req, res) => {
  await certificateService.resendCertificateInstance(req.params.id);
  res.status(200).json(successResponse('Certificate queued for regeneration successfully'));
});

/**
 * Revoke/delete all certificate instances for a template
 */
const revokeAllTemplateCertificates = catchAsync(async (req, res) => {
  const result = await certificateService.revokeAllTemplateCertificates(req.params.id, req.user);
  res.status(200).json(successResponse(`Successfully revoked all ${result.count} certificates for this template`, result));
});

/**
 * Resend/regenerate all or failed-only certificates for a template
 */
const resendAllTemplateCertificates = catchAsync(async (req, res) => {
  const result = await certificateService.resendAllTemplateCertificates(req.params.id, req.body.failedOnly, req.user);
  if (result.updated === 0) {
    return res.status(200).json(successResponse('No certificate instances found to resend.', { updated: 0 }));
  }
  res.status(200).json(successResponse(`Successfully queued ${result.updated} certificate(s) for regeneration`, result));
});

/**
 * Run AI evaluation for a certificate template — ASYNC queue-based
 */
const runAIEvaluation = catchAsync(async (req, res) => {
  const result = await certificateService.runAIEvaluation(req.params.id, req.query.mentorId, req.user);
  if (result.total === 0) {
    return res.status(200).json(successResponse('No active mentees found in this program.', [], 200));
  }
  res.status(202).json(successResponse(
    `Queued ${result.total} mentee evaluations. Results will arrive via real-time updates.`,
    result,
    202
  ));
});

/**
 * Get AI evaluation run status — polling fallback if socket disconnects
 */
const getAIEvaluationStatus = catchAsync(async (req, res) => {
  const status = await certificateService.getAIEvaluationStatus(req.query.runId);
  res.status(200).json(successResponse('AI evaluation status', status));
});

module.exports = {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  issueCertificates,
  listMenteeCertificates,
  getCertificateInstance,
  uploadAsset,
  getQualification,
  sendToMentors,
  getTemplateHistory,
  deleteCertificateInstance,
  resendCertificateInstance,
  revokeAllTemplateCertificates,
  resendAllTemplateCertificates,
  runAIEvaluation,
  getAIEvaluationStatus
};
