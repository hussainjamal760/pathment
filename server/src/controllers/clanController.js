const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const clanService = require('../services/clanService');

/**
 * GET /api/clans
 * List clans (optionally filtered by program/status).
 */
const listClans = catchAsync(async (req, res) => {
  const { programId, status } = req.query;
  const clans = await clanService.listClans({ programId, status });
  res.status(200).json(successResponse('Clans retrieved', { clans }));
});

/**
 * GET /api/clans/me/memberships
 * The current user's active clan memberships (across roles).
 */
const myMemberships = catchAsync(async (req, res) => {
  const memberships = await clanService.getMembershipsForUser(req.user.id);
  res.status(200).json(successResponse('Memberships retrieved', { memberships }));
});

/**
 * GET /api/clans/:id
 */
const getClan = catchAsync(async (req, res) => {
  const clan = await clanService.getClanById(req.params.id);
  res.status(200).json(successResponse('Clan retrieved', { clan }));
});

/**
 * POST /api/clans  (admin)
 */
const createClan = catchAsync(async (req, res) => {
  const clan = await clanService.createClan(req.body, req.user.id);
  res.status(201).json(successResponse('Clan created', { clan }, 201));
});

/**
 * PATCH /api/clans/:id  (admin / lead mentor)
 */
const updateClan = catchAsync(async (req, res) => {
  const clan = await clanService.updateClan(req.params.id, req.body);
  res.status(200).json(successResponse('Clan updated', { clan }));
});

/**
 * POST /api/clans/:id/members  (admin / lead mentor)
 * Assign a user to the clan with a clan-scoped role (clan-based assignment).
 */
const addMember = catchAsync(async (req, res) => {
  const membership = await clanService.addMember(req.params.id, req.body);
  res.status(201).json(successResponse('Member added', { membership }, 201));
});

/**
 * DELETE /api/clans/:id/members/:userId  (admin / lead mentor)
 */
const removeMember = catchAsync(async (req, res) => {
  const membership = await clanService.removeMember(req.params.id, req.params.userId);
  res.status(200).json(successResponse('Member removed', { membership }));
});

module.exports = {
  listClans,
  myMemberships,
  getClan,
  createClan,
  updateClan,
  addMember,
  removeMember
};
