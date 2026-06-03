const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const linearRoadmapService = require('../services/linearRoadmapService');

const list = catchAsync(async (req, res) => {
  const data = await linearRoadmapService.listForMentor(req.user.id);
  res.status(200).json(successResponse('Roadmaps retrieved', data));
});

const getOne = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.getRoadmap(req.params.id);
  res.status(200).json(successResponse('Roadmap retrieved', { roadmap }));
});

const create = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.createRoadmap(req.user.id, req.body);
  res.status(201).json(successResponse('Roadmap created', { roadmap }, 201));
});

const updateMeta = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.updateRoadmapMeta(req.user.id, req.params.id, req.body);
  res.status(200).json(successResponse('Roadmap updated', { roadmap }));
});

const addStep = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.addStep(req.user.id, req.params.id, req.body);
  res.status(201).json(successResponse('Step added', { roadmap }, 201));
});

const removeStep = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.removeStep(req.user.id, req.params.id, req.params.stepId);
  res.status(200).json(successResponse('Step removed', { roadmap }));
});

const importOrg = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.importOrgRoadmap(req.user.id, req.body.orgRoadmapId);
  res.status(201).json(successResponse('Roadmap imported', { roadmap }, 201));
});

const assign = catchAsync(async (req, res) => {
  const { menteeId, menteeIds, startStep = 0 } = req.body;
  if (Array.isArray(menteeIds) && menteeIds.length) {
    const results = await linearRoadmapService.bulkAssign(req.user.id, req.params.id, menteeIds, startStep);
    return res.status(200).json(successResponse('Roadmap assigned', { results }));
  }
  const progress = await linearRoadmapService.assignToMentee(req.user.id, req.params.id, menteeId, startStep);
  res.status(200).json(successResponse('Roadmap assigned', { progress }));
});

module.exports = { list, getOne, create, updateMeta, addStep, removeStep, importOrg, assign };
