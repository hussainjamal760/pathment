const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const promotionService = require('../services/promotionService');

function hasAdmin(req) {
  const caps = Array.isArray(req.user.capabilities) && req.user.capabilities.length
    ? req.user.capabilities
    : [req.user.role];
  return caps.includes('admin');
}

const list = catchAsync(async (req, res) => {
  const candidates = await promotionService.list({ actorId: req.user.id, isAdmin: hasAdmin(req) });
  res.status(200).json(successResponse('Promotion candidates retrieved', { candidates }));
});

const nominate = catchAsync(async (req, res) => {
  const candidate = await promotionService.nominate(req.body.menteeId, req.user.id);
  res.status(201).json(successResponse('Mentee nominated', { candidate }, 201));
});

const advance = catchAsync(async (req, res) => {
  const candidate = await promotionService.advance(req.params.id, req.body);
  res.status(200).json(successResponse('Candidate updated', { candidate }));
});

const promote = catchAsync(async (req, res) => {
  const candidate = await promotionService.promote(req.params.id, req.body);
  res.status(200).json(successResponse('Mentee promoted to co-mentor', { candidate }));
});

module.exports = { list, nominate, advance, promote };
