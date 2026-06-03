const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const schedulingService = require('../services/schedulingService');

// ── Availability (mentor) ─────────────────────────────────────────────────
const publishSlot = catchAsync(async (req, res) => {
  const slot = await schedulingService.publishSlot(req.user.id, req.body);
  res.status(201).json(successResponse('Slot published', { slot }, 201));
});

const listMyAvailability = catchAsync(async (req, res) => {
  const slots = await schedulingService.listMyAvailability(req.user.id);
  res.status(200).json(successResponse('Availability retrieved', { slots }));
});

const deleteSlot = catchAsync(async (req, res) => {
  const result = await schedulingService.deleteSlot(req.user.id, req.params.id);
  res.status(200).json(successResponse('Slot removed', result));
});

// ── Booking (mentee) ──────────────────────────────────────────────────────
const listOpenForMentor = catchAsync(async (req, res) => {
  const slots = await schedulingService.listOpenForMentor(req.query.mentorId);
  res.status(200).json(successResponse('Open slots retrieved', { slots }));
});

const getBookable = catchAsync(async (req, res) => {
  const mentors = await schedulingService.getBookableForMentee(req.user.id);
  res.status(200).json(successResponse('Bookable slots retrieved', { mentors }));
});

const bookSlot = catchAsync(async (req, res) => {
  const meeting = await schedulingService.bookSlot(req.user.id, req.body.slotId, req.body.agenda);
  res.status(201).json(successResponse('Meeting booked', { meeting }, 201));
});

// ── Meetings (both) ───────────────────────────────────────────────────────
const listMeetings = catchAsync(async (req, res) => {
  const meetings = await schedulingService.listMeetings(req.user.id, req.user.role);
  res.status(200).json(successResponse('Meetings retrieved', { meetings }));
});

const updateMeetingStatus = catchAsync(async (req, res) => {
  const meeting = await schedulingService.updateMeetingStatus(req.user.id, req.params.id, req.body.status);
  res.status(200).json(successResponse('Meeting updated', { meeting }));
});

module.exports = {
  publishSlot, listMyAvailability, deleteSlot,
  listOpenForMentor, getBookable, bookSlot, listMeetings, updateMeetingStatus
};
