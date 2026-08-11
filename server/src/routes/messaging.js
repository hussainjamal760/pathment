const express = require('express');
const upload = require('../middlewares/upload');
const router = express.Router();

const messagingController = require('../controllers/messagingController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateBody, validateParams, validateQuery } = require('../middlewares/validate');
const { messagingSchemas } = require('../validations/messagingValidation');
const { requirePermissionAnyScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

router.use(authenticate, authorize(['admin', 'mentor', 'mentee']));

router.get('/users/search', validateQuery(messagingSchemas.searchUsersQuery), messagingController.searchUsers);

router.get('/conversations', messagingController.getConversations);
router.post('/conversations/direct', validateBody(messagingSchemas.createDirectConversation), messagingController.createDirectConversation);
router.get('/conversations/:conversationId/messages', validateParams(messagingSchemas.conversationParams), validateQuery(messagingSchemas.listMessagesQuery), messagingController.getConversationMessages);
router.post('/conversations/:conversationId/read', validateParams(messagingSchemas.conversationParams), messagingController.markConversationRead);
router.post('/conversations/:conversationId/archive', validateParams(messagingSchemas.conversationParams), messagingController.archiveConversation);
router.post('/conversations/:conversationId/unarchive', validateParams(messagingSchemas.conversationParams), messagingController.unarchiveConversation);
router.delete('/conversations/:conversationId', validateParams(messagingSchemas.conversationParams), messagingController.deleteConversation);

router.post('/messages', validateBody(messagingSchemas.sendMessage), messagingController.sendMessage);
router.post('/messages/:messageId/reactions', messagingController.toggleReaction);

router.get('/notifications', messagingController.getNotifications);
router.post('/notifications/read-all', messagingController.markAllNotificationsRead);
router.post('/notifications/:notificationId/read', validateParams(messagingSchemas.markNotificationReadParams), messagingController.markNotificationRead);
router.delete('/notifications/:notificationId', validateParams(messagingSchemas.markNotificationReadParams), messagingController.deleteNotification);


// AI Draft Routes
router.get('/drafts', requirePermissionAnyScope(PERMISSIONS.MENTEE_MANAGE), messagingController.getPendingDrafts);
router.post('/messages/approve', requirePermissionAnyScope(PERMISSIONS.MENTEE_MANAGE), validateBody(messagingSchemas.approveDraft), messagingController.approveDraft);
router.post('/drafts/:draftId/reject', requirePermissionAnyScope(PERMISSIONS.MENTEE_MANAGE), validateParams(messagingSchemas.rejectDraftParams), messagingController.rejectDraft);

// Mentor RAG Documents Routes
router.get('/mentor/documents', requirePermissionAnyScope(PERMISSIONS.MENTEE_MANAGE), messagingController.getMentorDocuments);
router.post('/mentor/documents', requirePermissionAnyScope(PERMISSIONS.MENTEE_MANAGE), upload.singlePdfSafe('file'), validateBody(messagingSchemas.uploadMentorDocument), messagingController.uploadMentorDocument);
router.delete('/mentor/documents/:documentId', requirePermissionAnyScope(PERMISSIONS.MENTEE_MANAGE), messagingController.deleteMentorDocument);

module.exports = router;
