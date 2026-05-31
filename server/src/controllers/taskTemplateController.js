const taskTemplateService = require('../services/taskTemplateService');
const taskService = require('../services/taskService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');
const { ValidationError } = require('../utils/errors/errorTypes');

exports.createTemplate = catchAsync(async (req, res) => {
  const template = await taskTemplateService.createTemplate(req.user.id, req.body);
  res.status(201).json(successResponse('Template created', { template }, 201));
});

exports.getTemplates = catchAsync(async (req, res) => {
  const templates = await taskTemplateService.getTemplatesByMentor(req.user.id);
  res.status(200).json(successResponse('Templates retrieved', { templates }));
});

exports.updateTemplate = catchAsync(async (req, res) => {
  const template = await taskTemplateService.updateTemplate(req.params.id, req.user.id, req.body);
  res.status(200).json(successResponse('Template updated', { template }));
});

exports.deleteTemplate = catchAsync(async (req, res) => {
  const result = await taskTemplateService.deleteTemplate(req.params.id, req.user.id);
  res.status(200).json(successResponse(result.message, {}));
});

exports.assignTemplate = catchAsync(async (req, res) => {
  const { mentees, dueDate } = req.body;

  if (!mentees || !Array.isArray(mentees) || mentees.length === 0) {
    throw new ValidationError('No mentees provided');
  }

  const template = await taskTemplateService.getTemplateById(req.params.id, req.user.id);

  const results = {
    successful: [],
    failed: []
  };

  for (const mentee of mentees) {
    try {
      const task = await taskService.createCustomTask({
        menteeId: mentee.menteeId,
        enrollmentId: mentee.enrollmentId,
        title: template.title,
        description: template.description,
        type: template.type,
        difficulty: template.difficulty,
        deliverable: template.deliverable,
        acceptanceCriteria: template.acceptanceCriteria,
        pointsBase: template.pointsBase,
        estimatedHours: template.estimatedHours,
        dueDate
      }, req.user.id);
      results.successful.push({ menteeId: mentee.menteeId, taskId: task.assignedTasks?.[0]?.id });
    } catch (error) {
      results.failed.push({ menteeId: mentee.menteeId, reason: error.message });
    }
  }

  res.status(201).json(successResponse('Template assignment completed', results, 201));
});

module.exports = exports;
