const { models } = require('../db');
const { Op } = require('sequelize');

/**
 * aiEvalDataService — Data aggregation for certificate AI eligibility evaluation.
 * Queries assigned tasks, roadmaps, and blockers to build a rich metric snapshot per mentee.
 */
async function aggregateMenteeData(menteeIds) {
  if (!menteeIds || !menteeIds.length) return [];

  const tasks = await models.AssignedTask.findAll({
    where: {
      menteeId: { [Op.in]: menteeIds },
      status: { [Op.ne]: 'cancelled' }
    },
    attributes: [
      'menteeId', 'status', 'pointsAwarded', 'pointsBase',
      'finalRating', 'isLate', 'completedAt', 'isCustomTask', 'dueDate'
    ],
    include: [{
      model: models.RoadmapTask,
      as: 'roadmapTask',
      attributes: ['title', 'type', 'difficulty', 'description']
    }],
    raw: false
  });

  const blockers = await models.Blocker.findAll({
    where: { menteeId: { [Op.in]: menteeIds } },
    attributes: ['menteeId', 'status', 'category', 'severity', 'openedAt', 'resolvedAt'],
    raw: true
  });

  const taskMap = {};
  const blockerMap = {};
  for (const id of menteeIds) {
    taskMap[id] = [];
    blockerMap[id] = [];
  }

  for (const t of tasks) taskMap[t.menteeId]?.push(t);
  for (const b of blockers) blockerMap[b.menteeId]?.push(b);

  return menteeIds.map((id) => {
    const myTasks = taskMap[id] || [];
    const myBlockers = blockerMap[id] || [];

    let totalBase = 0;
    let totalAwarded = 0;
    const taskSummaries = [];

    for (const t of myTasks) {
      const base = t.pointsBase ?? t.roadmapTask?.pointsBase ?? 10;
      const awarded = t.pointsAwarded ?? 0;
      totalBase += base;
      if (t.status === 'completed') totalAwarded += awarded;

      taskSummaries.push({
        title: t.roadmapTask?.title ?? (t.isCustomTask ? 'Custom Task' : 'Unknown'),
        type: t.roadmapTask?.type ?? 'custom',
        difficulty: t.roadmapTask?.difficulty ?? 'medium',
        status: t.status,
        rating: t.finalRating ? parseFloat(t.finalRating) : null,
        isLate: t.isLate
      });
    }

    const normalizedScore = totalBase > 0 ? Math.round((totalAwarded / totalBase) * 100) : 0;
    const completedTasks = myTasks.filter(t => t.status === 'completed');
    const totalTasks = myTasks.length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

    const onTimeTasks = completedTasks.filter(t => !t.isLate).length;
    const onTimeRate = completedTasks.length > 0 ? Math.round((onTimeTasks / completedTasks.length) * 100) : 0;

    const ratedTasks = completedTasks.filter(t => t.finalRating != null);
    const avgRating = ratedTasks.length > 0
      ? parseFloat((ratedTasks.reduce((s, t) => s + parseFloat(t.finalRating), 0) / ratedTasks.length).toFixed(2))
      : null;

    const totalBlockers = myBlockers.length;
    const resolvedBlockers = myBlockers.filter(b => b.status === 'resolved').length;
    const openBlockers = totalBlockers - resolvedBlockers;

    const openByName = myBlockers.filter(b => b.status !== 'resolved');
    const blockersBySeverity = openByName.reduce((acc, b) => {
      const sev = b.severity || 'unknown';
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {});

    return {
      mentee_id: id,
      normalized_score: normalizedScore,
      completion_rate: completionRate,
      on_time_rate: onTimeRate,
      avg_rating: avgRating,
      tasks: taskSummaries,
      total_tasks: totalTasks,
      completed_tasks: completedTasks.length,
      blockers: {
        total: totalBlockers,
        resolved: resolvedBlockers,
        open: openBlockers,
        by_severity: blockersBySeverity,
        categories: [...new Set(myBlockers.map(b => b.category))]
      }
    };
  });
}

module.exports = { aggregateMenteeData };
