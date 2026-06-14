const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const promotionService = require('../services/promotionService');

async function hasAdmin(req) {
  // Derived capabilities (live), not the stored array, so an org/program admin
  // sees the full pipeline even if their `capabilities` column is stale.
  const caps = req.loadCapabilities ? await req.loadCapabilities() : [req.user.role];
  return caps.includes('admin');
}

const list = catchAsync(async (req, res) => {
  const candidates = await promotionService.list({ actorId: req.user.id, isAdmin: await hasAdmin(req) });
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

const decline = catchAsync(async (req, res) => {
  const candidate = await promotionService.decline(req.params.id, req.body);
  res.status(200).json(successResponse('Nomination declined', { candidate }));
});

const draft = catchAsync(async (req, res) => {
  const draft = await promotionService.aiDraft(req.params.id);
  res.status(200).json(successResponse('Interview draft generated', draft));
});

module.exports = { list, nominate, advance, promote, decline, draft };
