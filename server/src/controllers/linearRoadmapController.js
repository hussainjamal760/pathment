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

const replaceSteps = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.replaceSteps(req.user.id, req.params.id, req.body?.steps || []);
  res.status(200).json(successResponse('Steps saved', { roadmap }));
});

const importOrg = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.importOrgRoadmap(req.user.id, req.body.orgRoadmapId);
  res.status(201).json(successResponse('Roadmap imported', { roadmap }, 201));
});

const assign = catchAsync(async (req, res) => {
  const { menteeId, menteeIds, startStep = 0, dueDate = null, stepIndexes = null, stepOverrides = null } = req.body;
  if (Array.isArray(menteeIds) && menteeIds.length) {
    const results = await linearRoadmapService.bulkAssign(req.user.id, req.params.id, menteeIds, startStep, dueDate, stepIndexes, stepOverrides);
    const assigned = results.filter((r) => r.ok).length;
    return res.status(200).json(successResponse('Roadmap assigned', { results, assigned, failed: results.length - assigned }));
  }
  const progress = await linearRoadmapService.assignToMentee(req.user.id, req.params.id, menteeId, startStep, null, dueDate, stepIndexes, stepOverrides);
  res.status(200).json(successResponse('Roadmap assigned', { progress }));
});

const assignees = catchAsync(async (req, res) => {
  const menteeIds = await linearRoadmapService.getAssignees(req.params.id);
  res.status(200).json(successResponse('Roadmap assignees retrieved', { menteeIds }));
});

const menteeStepStatus = catchAsync(async (req, res) => {
  const data = await linearRoadmapService.getMenteeStepStatus(req.params.id, req.params.menteeId);
  res.status(200).json(successResponse('Mentee step status', data));
});

const listOrg = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.programId) {
    filter.programId = req.query.programId;
  }
  const roadmaps = await linearRoadmapService.listOrgRoadmaps(filter);
  res.status(200).json(successResponse('Org roadmaps retrieved', { roadmaps }));
});

const createOrg = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.createOrgRoadmap(req.user.id, req.body);
  res.status(201).json(successResponse('Org roadmap created', { roadmap }, 201));
});

const updateOrg = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.updateOrgMeta(req.params.id, req.body);
  res.status(200).json(successResponse('Org roadmap updated', { roadmap }));
});

const addOrgStep = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.addOrgStep(req.params.id, req.body);
  res.status(201).json(successResponse('Step added', { roadmap }, 201));
});

const removeOrgStep = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.removeOrgStep(req.params.id, req.params.stepId);
  res.status(200).json(successResponse('Step removed', { roadmap }));
});

const replaceOrgSteps = catchAsync(async (req, res) => {
  const roadmap = await linearRoadmapService.replaceOrgSteps(req.params.id, req.body?.steps || []);
  res.status(200).json(successResponse('Steps saved', { roadmap }));
});

const deleteOrg = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Org roadmap deleted', await linearRoadmapService.deleteOrgRoadmap(req.params.id)));
});

const generate = catchAsync(async (req, res) => {
  const steps = await linearRoadmapService.generateSteps(req.body, req.user.id);
  res.status(200).json(successResponse('Roadmap drafted', { steps }));
});

const myRoadmaps = catchAsync(async (req, res) => {
  const roadmaps = await linearRoadmapService.getMenteeRoadmaps(req.user.id);
  res.status(200).json(successResponse('Roadmaps retrieved', { roadmaps }));
});

const getLinks = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Links retrieved', { links: await linearRoadmapService.getNextLinks(req.params.id) }));
});
const setLinks = catchAsync(async (req, res) => {
  const links = await linearRoadmapService.setNextLinks(req.user.id, req.params.id, req.body?.toIds || []);
  res.status(200).json(successResponse('Chain updated', { links }));
});
const advance = catchAsync(async (req, res) => {
  const { menteeId, nextRoadmapId } = req.body || {};
  const progress = await linearRoadmapService.manualAdvance(req.user.id, menteeId, nextRoadmapId);
  res.status(200).json(successResponse('Next roadmap assigned', { progress }));
});

module.exports = {
  list, getOne, create, updateMeta, addStep, removeStep, importOrg, assign, assignees,
  listOrg, createOrg, updateOrg, addOrgStep, removeOrgStep, replaceOrgSteps, deleteOrg, generate, myRoadmaps,
  getLinks, setLinks, advance, replaceSteps, menteeStepStatus
};
