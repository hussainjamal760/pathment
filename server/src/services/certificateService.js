const certificateTemplateService = require('./certificateTemplateService');
const certificateIssuanceService = require('./certificateIssuanceService');
const certificateQualificationService = require('./certificateQualificationService');

/**
 * CertificateService — Facade coordinator orchestrating domain-focused certificate sub-services.
 * Preserves 100% backward compatibility for controllers, workers, and legacy API callers.
 */
class CertificateService {
  // ── Mentor Scoping Helpers ──────────────────────────────────────────────────
  getMentorScopedMenteeIds(...args) {
    return certificateQualificationService.getMentorScopedMenteeIds(...args);
  }
  getMentorScopedMenteeClans(...args) {
    return certificateQualificationService.getMentorScopedMenteeClans(...args);
  }

  // ── Template Operations ────────────────────────────────────────────────────
  createTemplate(...args) {
    return certificateTemplateService.createTemplate(...args);
  }
  listTemplates(...args) {
    return certificateTemplateService.listTemplates(...args);
  }
  getTemplate(...args) {
    return certificateTemplateService.getTemplate(...args);
  }
  updateTemplate(...args) {
    return certificateTemplateService.updateTemplate(...args);
  }
  deleteTemplate(...args) {
    return certificateTemplateService.deleteTemplate(...args);
  }
  uploadAsset(...args) {
    return certificateTemplateService.uploadAsset(...args);
  }
  sendToMentors(...args) {
    return certificateTemplateService.sendToMentors(...args);
  }

  // ── Issuance & Instance Operations ──────────────────────────────────────────
  issueCertificates(...args) {
    return certificateIssuanceService.issueCertificates(...args);
  }
  listMenteeCertificates(...args) {
    return certificateIssuanceService.listMenteeCertificates(...args);
  }
  getCertificateInstance(...args) {
    return certificateIssuanceService.getCertificateInstance(...args);
  }
  deleteCertificateInstance(...args) {
    return certificateIssuanceService.deleteCertificateInstance(...args);
  }
  resendCertificateInstance(...args) {
    return certificateIssuanceService.resendCertificateInstance(...args);
  }
  revokeAllTemplateCertificates(...args) {
    return certificateIssuanceService.revokeAllTemplateCertificates(...args);
  }
  resendAllTemplateCertificates(...args) {
    return certificateIssuanceService.resendAllTemplateCertificates(...args);
  }
  resetQueueEntry(...args) {
    return certificateIssuanceService.resetQueueEntry(...args);
  }
  bulkResetQueueEntries(...args) {
    return certificateIssuanceService.bulkResetQueueEntries(...args);
  }

  // ── Qualification & AI Evaluation Operations ──────────────────────────────
  getQualification(...args) {
    return certificateQualificationService.getQualification(...args);
  }
  getTemplateHistory(...args) {
    return certificateQualificationService.getTemplateHistory(...args);
  }
  runAIEvaluation(...args) {
    return certificateQualificationService.runAIEvaluation(...args);
  }
  getAIEvaluationStatus(...args) {
    return certificateQualificationService.getAIEvaluationStatus(...args);
  }
}

module.exports = new CertificateService();
