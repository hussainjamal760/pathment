const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const frictionService = require('../services/frictionService');

/**
 * A mentee defaults to acting on their own records; mentors/admins pass an
 * explicit menteeId. (Finer-grained ownership checks come with the per-clan
 * permission work.)
 */
function resolveMenteeId(req) {
  if (req.query.menteeId) return req.query.menteeId;
  if (req.body && req.body.menteeId) return req.body.menteeId;
  return req.user.role === 'mentee' ? req.user.id : undefined;
}

// ── Blockers ──────────────────────────────────────────────────────────────
const listBlockers = catchAsync(async (req, res) => {
  const blockers = await frictionService.listBlockers({
    menteeId: resolveMenteeId(req),
    status: req.query.status
  });
  res.status(200).json(successResponse('Blockers retrieved', { blockers }));
});

const createBlocker = catchAsync(async (req, res) => {
  const menteeId = req.body.menteeId || (req.user.role === 'mentee' ? req.user.id : undefined);
  const blocker = await frictionService.createBlocker({ ...req.body, menteeId }, req.user.id);
  res.status(201).json(successResponse('Blocker logged', { blocker }, 201));
});

const resolveBlocker = catchAsync(async (req, res) => {
  const blocker = await frictionService.resolveBlocker(req.params.id);
  res.status(200).json(successResponse('Blocker resolved', { blocker }));
});

// ── Delays ──────────────────────────────────────────────────────────────
const listDelays = catchAsync(async (req, res) => {
  const delays = await frictionService.listDelays({ menteeId: resolveMenteeId(req) });
  res.status(200).json(successResponse('Delays retrieved', { delays }));
});

const createDelay = catchAsync(async (req, res) => {
  const menteeId = req.body.menteeId || (req.user.role === 'mentee' ? req.user.id : undefined);
  const delay = await frictionService.createDelay({ ...req.body, menteeId }, req.user.id);
  res.status(201).json(successResponse('Delay logged', { delay }, 201));
});

const acceptDelay = catchAsync(async (req, res) => {
  const delay = await frictionService.acceptDelay(req.params.id, req.body);
  res.status(200).json(successResponse('Delay updated', { delay }));
});

module.exports = {
  listBlockers,
  createBlocker,
  resolveBlocker,
  listDelays,
  createDelay,
  acceptDelay
};
