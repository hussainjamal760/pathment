const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const communityService = require('../services/communityService');

const feed = catchAsync(async (req, res) => {
  const data = await communityService.feed(req.user.id);
  res.status(200).json(successResponse('Community feed retrieved', data));
});

const createPost = catchAsync(async (req, res) => {
  const post = await communityService.createPost(req.user.id, req.body);
  res.status(201).json(successResponse('Posted', { post }, 201));
});

const react = catchAsync(async (req, res) => {
  const result = await communityService.toggleReaction(req.params.id, req.user.id, req.body.type);
  res.status(200).json(successResponse('Reaction updated', result));
});

const people = catchAsync(async (req, res) => {
  const people = await communityService.getPeople(req.user.id);
  res.status(200).json(successResponse('People retrieved', { people }));
});

module.exports = { feed, createPost, react, people };
