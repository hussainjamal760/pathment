const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const svc = require('../services/scheduleTemplateService');

const listTemplates = catchAsync(async (req, res) => {
  const data = await svc.listForMentor(req.user.id);
  res.status(200).json(successResponse('Templates retrieved', data));
});

const createTemplate = catchAsync(async (req, res) => {
  const template = await svc.createTemplate(req.user.id, req.body);
  res.status(201).json(successResponse('Template created', { template }, 201));
});

const updateTemplate = catchAsync(async (req, res) => {
  const template = await svc.updateTemplate(req.user.id, req.params.id, req.body);
  res.status(200).json(successResponse('Template updated', { template }));
});

const deleteTemplate = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Template deleted', await svc.deleteTemplate(req.user.id, req.params.id)));
});

const importTemplate = catchAsync(async (req, res) => {
  const template = await svc.importTemplate(req.user.id, req.body.orgId);
  res.status(201).json(successResponse('Template imported', { template }, 201));
});

const assign = catchAsync(async (req, res) => {
  const results = await svc.assignToMentees(req.params.id, req.body.menteeIds, req.user.id);
  res.status(200).json(successResponse('Schedule assigned', { results }));
});

const getMenteeSchedule = catchAsync(async (req, res) => {
  const schedule = await svc.getMenteeSchedule(req.params.id);
  res.status(200).json(successResponse('Schedule retrieved', { schedule }));
});

const getMySchedule = catchAsync(async (req, res) => {
  const schedule = await svc.getMenteeSchedule(req.user.id);
  res.status(200).json(successResponse('Schedule retrieved', { schedule }));
});

const updateSlot = catchAsync(async (req, res) => {
  const slot = await svc.updateSlot(req.params.id, req.params.slotId, req.body, req.user.id);
  res.status(200).json(successResponse('Slot updated', { slot }));
});

module.exports = {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, importTemplate,
  assign, getMenteeSchedule, getMySchedule, updateSlot
};
