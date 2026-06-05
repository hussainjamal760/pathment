const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { validateBody, validateQuery } = require('../middlewares/validate');
const { adminSchemas } = require('../validations/adminValidation');
const { authenticate, authorize } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');

/**
 * All admin routes require authentication and admin role
 */

// Get dashboard statistics
router.get(
  '/dashboard/stats',
  authenticate,
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  adminController.getDashboardStats
);

// Create new admin (only admins with 'manage_users' or 'all' permissions)
router.post(
  '/create',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  validateBody(adminSchemas.createAdmin),
  adminController.createAdmin
);

// Create registration invite (invite.create - super_admin, intake_manager, program_admin)
router.post(
  '/invites',
  authenticate,
  requirePermission(PERMISSIONS.INVITE_CREATE),
  validateBody(adminSchemas.createInvite),
  adminController.createRegistrationInvite
);

// Bulk create registration invites
router.post(
  '/invites/bulk',
  authenticate,
  requirePermission(PERMISSIONS.INVITE_CREATE),
  validateBody(adminSchemas.bulkInvite),
  adminController.bulkRegistrationInvites
);

// List registration invites
router.get(
  '/invites',
  authenticate,
  requirePermission(PERMISSIONS.INVITE_CREATE),
  validateQuery(adminSchemas.inviteListQuery),
  adminController.listRegistrationInvites
);

// Revoke registration invite
router.post(
  '/invites/:id/revoke',
  authenticate,
  requirePermission(PERMISSIONS.INVITE_CREATE),
  adminController.revokeRegistrationInvite
);

// Update admin permissions
router.put(
  '/:id/permissions',
  authenticate,
  requirePermission(PERMISSIONS.ACCESS_MANAGE),
  validateBody(adminSchemas.updatePermissions),
  adminController.updatePermissions
);

// Recalculate mentor mentee counts (utility endpoint)
router.post(
  '/recalculate-mentor-counts',
  authenticate,
  requirePermission(PERMISSIONS.SYSTEM_SETTINGS),
  adminController.recalculateMentorCounts
);

// Delete a user (mentee or mentor)
router.delete(
  '/users/:id',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.deleteUser
);

// Suspend a user
router.put(
  '/users/:id/suspend',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.suspendUser
);

// Unsuspend a user
router.put(
  '/users/:id/unsuspend',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.unsuspendUser
);

// Update a user's platform capabilities (multi-role views)
router.patch(
  '/users/:id/capabilities',
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  adminController.updateUserCapabilities
);

module.exports = router;
