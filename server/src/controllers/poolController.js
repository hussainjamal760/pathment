const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const poolService = require('../services/poolService');

const list = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Pools retrieved', { pools: await poolService.list(req.user) }));
});

const create = catchAsync(async (req, res) => {
  const pool = await poolService.create(req.body, req.user);
  res.status(201).json(successResponse('Pool created', { pool }, 201));
});

const update = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Pool updated', { pool: await poolService.update(req.params.id, req.body, req.user) }));
});

const setStatus = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Pool updated', { pool: await poolService.setStatus(req.params.id, req.body.status, req.user) }));
});

const dashboard = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Pool retrieved', await poolService.dashboard(req.params.id)));
});

const importMembers = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Candidates processed', await poolService.importMembers(req.params.id, req.body, req.user)));
});

const importApplications = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Applicants processed', await poolService.importFromApplications(req.params.id, req.body, req.user)));
});

const changeDecision = catchAsync(async (req, res) => {
  const member = await poolService.changeDecision(req.params.id, req.params.memberId, req.body, req.user);
  res.status(200).json(successResponse('Outcome changed', { member }));
});

const placementPreview = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Placement suggested', await poolService.placementPreview(req.params.id)));
});

const history = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('History retrieved', await poolService.history(req.params.id)));
});

const removeMember = catchAsync(async (req, res) => {
  const member = await poolService.removeMember(req.params.id, req.params.memberId, req.body, req.user);
  res.status(200).json(successResponse('Candidate updated', { member }));
});

const assignWork = catchAsync(async (req, res) => {
  res.status(201).json(successResponse('Work assigned', await poolService.assignWork(req.params.id, req.body, req.user), 201));
});

const reviewQueue = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Review queue retrieved', { items: await poolService.reviewQueue(req.params.id) }));
});

const proposeShortlist = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Shortlist proposed', { snapshot: await poolService.proposeShortlist(req.params.id, req.user) }));
});

const finalize = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Selection confirmed', await poolService.finalizeSelection(req.params.id, req.body, req.user)));
});

const place = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Placement processed', await poolService.place(req.params.id, req.body, req.user)));
});

const mine = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Your qualification', { pools: await poolService.mine(req.user.id) }));
});

module.exports = {
  list, create, update, setStatus, dashboard, history,
  importMembers, importApplications, removeMember, changeDecision,
  assignWork, reviewQueue, proposeShortlist, finalize, placementPreview, place, mine
};
