const { models } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');

/** Daily check-in log (one entry per mentee per day, upserted). */
class DailyLogService {
  async upsert(menteeId, { dateKey, tasksDone, slotsDone, note }) {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new ValidationError('dateKey (YYYY-MM-DD) is required');
    }
    const tasks = Array.isArray(tasksDone) ? tasksDone : [];
    const slots = Array.isArray(slotsDone) ? slotsDone : [];
    let entry = await models.DailyLogEntry.findOne({ where: { menteeId, dateKey } });
    if (entry) {
      entry.tasksDone = tasks;
      entry.slotsDone = slots;
      entry.note = note ?? null;
      entry.loggedAt = new Date();
      await entry.save();
    } else {
      entry = await models.DailyLogEntry.create({ menteeId, dateKey, tasksDone: tasks, slotsDone: slots, note: note ?? null });
    }
    return entry;
  }

  async list(menteeId, limit = 14) {
    return models.DailyLogEntry.findAll({
      where: { menteeId },
      order: [['dateKey', 'DESC']],
      limit
    });
  }
}

module.exports = new DailyLogService();
