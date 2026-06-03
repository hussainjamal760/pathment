const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const announcementService = require('../services/announcementService');

const list = catchAsync(async (req, res) => {
  const announcements = await announcementService.list(req.user.id, { audience: req.query.audience });
  res.status(200).json(successResponse('Announcements retrieved', { announcements }));
});

const create = catchAsync(async (req, res) => {
  const announcement = await announcementService.create(req.body, req.user.id);
  res.status(201).json(successResponse('Announcement posted', { announcement }, 201));
});

const togglePin = catchAsync(async (req, res) => {
  const announcement = await announcementService.togglePin(req.params.id);
  res.status(200).json(successResponse('Pin toggled', { announcement }));
});

const react = catchAsync(async (req, res) => {
  const result = await announcementService.toggleReaction(req.params.id, req.user.id, req.body.type);
  res.status(200).json(successResponse('Reaction updated', result));
});

const remove = catchAsync(async (req, res) => {
  const result = await announcementService.remove(req.params.id);
  res.status(200).json(successResponse('Announcement removed', result));
});

module.exports = { list, create, togglePin, react, remove };
