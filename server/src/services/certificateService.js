const certificateTemplateService = require('./certificateTemplateService');
const certificateIssuanceService = require('./certificateIssuanceService');
const certificateQualificationService = require('./certificateQualificationService');

class CertificateService {
  getMentorScopedMenteeIds(...args) {
    return certificateQualificationService.getMentorScopedMenteeIds(...args);
  }
  getMentorScopedMenteeClans(...args) {
    return certificateQualificationService.getMentorScopedMenteeClans(...args);
  }

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
