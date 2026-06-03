const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const dailyLogService = require('../services/dailyLogService');

/** GET /api/mentee/daily-log */
const getMyDailyLogs = catchAsync(async (req, res) => {
  const entries = await dailyLogService.list(req.user.id, Number(req.query.limit) || 14);
  res.status(200).json(successResponse('Daily logs retrieved', { entries }));
});

/** POST /api/mentee/daily-log  { dateKey, tasksDone, note } */
const saveMyDailyLog = catchAsync(async (req, res) => {
  const entry = await dailyLogService.upsert(req.user.id, req.body);
  res.status(200).json(successResponse('Daily log saved', { entry }));
});

module.exports = { getMyDailyLogs, saveMyDailyLog };
