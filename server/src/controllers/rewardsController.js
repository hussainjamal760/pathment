const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const rewardsService = require('../services/rewardsService');

const overview = catchAsync(async (req, res) => {
  const data = await rewardsService.overview();
  res.status(200).json(successResponse('Rewards retrieved', data));
});

const createGift = catchAsync(async (req, res) => {
  const gift = await rewardsService.createGift(req.body, req.user.id);
  res.status(201).json(successResponse('Gift added', { gift }, 201));
});

const removeGift = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Gift removed', await rewardsService.removeGift(req.params.id)));
});

const redeem = catchAsync(async (req, res) => {
  const redemption = await rewardsService.redeem(req.body.giftId, req.body.menteeId, req.user.id);
  res.status(201).json(successResponse('Gift redeemed', { redemption }, 201));
});

module.exports = { overview, createGift, removeGift, redeem };
