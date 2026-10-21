const express = require('express');
const router = express.Router();
const c = require('../controllers/poolController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requirePermissionAnyScope, scope } = require('../middlewares/authz');
const { validateBody, validateParams } = require('../middlewares/validate');
const { PERMISSIONS: P } = require('../config/permissions');
const v = require('../validations/poolValidation');

/** Every pool route is checked against the pool's own programme. */
const onPool = (permission, params = v.idParams) => [authenticate, validateParams(params), requirePermission(permission, scope.pool('id'))];

// The candidate's own qualification page (self only, no rank or score).
router.get('/mine', authenticate, c.mine);

// Every built-in pool role includes pool.review; the list is narrowed to the
// caller's programmes in the service.
router.get('/', authenticate, requirePermissionAnyScope(P.POOL_REVIEW), c.list);
router.post('/', authenticate, validateBody(v.create),
  requirePermission(P.POOL_MANAGE, (req) => ({ programId: req.body.programId })), c.create);

router.get('/:id', ...onPool(P.POOL_REVIEW), c.dashboard);
router.patch('/:id', ...onPool(P.POOL_MANAGE), validateBody(v.update), c.update);
router.post('/:id/status', ...onPool(P.POOL_MANAGE), validateBody(v.status), c.setStatus);

router.post('/:id/members', ...onPool(P.POOL_MEMBERS), validateBody(v.importMembers), c.importMembers);
router.post('/:id/members/:memberId/remove', ...onPool(P.POOL_MEMBERS, v.memberParams), validateBody(v.removeMember), c.removeMember);

router.post('/:id/work', ...onPool(P.POOL_ASSIGN), validateBody(v.assignWork), c.assignWork);
router.get('/:id/reviews', ...onPool(P.POOL_REVIEW), c.reviewQueue);

router.post('/:id/shortlist', ...onPool(P.POOL_SELECT), c.proposeShortlist);
router.post('/:id/finalize', ...onPool(P.POOL_SELECT), validateBody(v.finalize), c.finalize);
router.post('/:id/placements', ...onPool(P.POOL_SELECT), validateBody(v.place), c.place);

module.exports = router;
