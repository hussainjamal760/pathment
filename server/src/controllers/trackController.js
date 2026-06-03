const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const svc = require('../services/trackService');

const listForMentee = catchAsync(async (req, res) => {
  const tracks = await svc.listForMentee(req.params.menteeId, { includeArchived: req.query.archived === '1' });
  res.status(200).json(successResponse('Tracks retrieved', { tracks }));
});

const create = catchAsync(async (req, res) => {
  const track = await svc.create(req.params.menteeId, req.user.id, req.body);
  res.status(201).json(successResponse('Track created', { track }, 201));
});

const rename = catchAsync(async (req, res) => {
  const track = await svc.rename(req.params.id, req.body.name);
  res.status(200).json(successResponse('Track renamed', { track }));
});

const setArchived = catchAsync(async (req, res) => {
  const track = await svc.setArchived(req.params.id, req.body.archived);
  res.status(200).json(successResponse('Track updated', { track }));
});

const reorder = catchAsync(async (req, res) => {
  const tracks = await svc.reorder(req.params.menteeId, req.body.orderedIds);
  res.status(200).json(successResponse('Tracks reordered', { tracks }));
});

const remove = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Track deleted', await svc.remove(req.params.id)));
});

const addTask = catchAsync(async (req, res) => {
  const task = await svc.addTask(req.params.id, req.user.id, req.body);
  res.status(201).json(successResponse('Task added to track', { task }, 201));
});

const setTaskTrack = catchAsync(async (req, res) => {
  const result = await svc.setTaskTrack(req.params.taskId, req.body.trackId || null);
  res.status(200).json(successResponse('Task track updated', result));
});

module.exports = { listForMentee, create, rename, setArchived, reorder, remove, addTask, setTaskTrack };
