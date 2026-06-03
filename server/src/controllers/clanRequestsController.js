const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const clanRequestsService = require('../services/clanRequestsService');

const overview = catchAsync(async (req, res) => {
  const data = await clanRequestsService.overview();
  res.status(200).json(successResponse('Clan requests retrieved', data));
});

const createRequest = catchAsync(async (req, res) => {
  const request = await clanRequestsService.createRequest(req.body, req.user.id);
  res.status(201).json(successResponse('Request created', { request }, 201));
});

const resolveRequest = catchAsync(async (req, res) => {
  const request = await clanRequestsService.resolveRequest(req.params.id, req.body);
  res.status(200).json(successResponse('Request resolved', { request }));
});

const createCrossClan = catchAsync(async (req, res) => {
  const assignment = await clanRequestsService.createCrossClan(req.body, req.user.id);
  res.status(201).json(successResponse('Assignment created', { assignment }, 201));
});

const removeCrossClan = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Assignment removed', await clanRequestsService.removeCrossClan(req.params.id)));
});

const createPolicy = catchAsync(async (req, res) => {
  const policy = await clanRequestsService.createPolicy(req.body, req.user.id);
  res.status(201).json(successResponse('Policy created', { policy }, 201));
});

const removePolicy = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Policy removed', await clanRequestsService.removePolicy(req.params.id)));
});

module.exports = { overview, createRequest, resolveRequest, createCrossClan, removeCrossClan, createPolicy, removePolicy };
