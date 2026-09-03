const { models } = require('../db');
const { Op } = require('sequelize');


const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const DIFFICULTY_WEIGHT = { easy: 1, medium: 2, hard: 3, expert: 4 };

function computeBlockerScore(openBlockers, resolvedBlockers) {
  const total = openBlockers.length + resolvedBlockers.length;
  if (total === 0) return 100;

  const openPenalty   = openBlockers.reduce((s, b) => s + (SEVERITY_WEIGHT[b.severity] ?? 2), 0);
  const resolvedBonus = resolvedBlockers.reduce((s, b) => s + (SEVERITY_WEIGHT[b.severity] ?? 2) * 0.5, 0);
  const maxPenalty    = total * 3;
  const raw           = Math.max(0, maxPenalty - openPenalty + resolvedBonus);
  return Math.min(100, Math.round((raw / maxPenalty) * 100));
}

function computeWeightedOnTimeRate(completedTasks) {
  if (completedTasks.length === 0) return 0;

  let wtOntime = 0;
  let wtTotal  = 0;
  for (const t of completedTasks) {
    const w = DIFFICULTY_WEIGHT[t.difficulty] ?? DIFFICULTY_WEIGHT.medium;
    wtTotal += w;
    if (!t.isLate) wtOntime += w;
  }
  return wtTotal > 0 ? Math.round((wtOntime / wtTotal) * 100) : 0;
}

function computeAttendance(menteeId, clanSessions, entryMap) {
  if (!clanSessions || clanSessions.length === 0) {
    return {
      total_sessions: 0,
      present: 0,
      excused: 0,
      absent: 0,
      attendance_pct: null,
      avg_contribution_pts: null,
      data_available: false
    };
  }

  let present = 0;
  let excused = 0;
  let absent  = 0;
  let totalContrib = 0;
  let presentCount = 0;

  for (const session of clanSessions) {
    const key   = `${session.id}:${menteeId}`;
    const entry = entryMap.get(key);
    const att   = entry?.attendance ?? null;

    if (att === 'present') {
      present++;
      totalContrib += entry.contributionPoints ?? 0;
      presentCount++;
    } else if (att === 'excused') {
      excused++;
    } else {
      absent++; 
    }
  }

  const accepted       = present + excused;
  const totalSessions  = clanSessions.length;
  const attendancePct  = Math.round((accepted / totalSessions) * 100);
  const avgContrib     = presentCount > 0 ? Math.round(totalContrib / presentCount) : 0;

  return {
    total_sessions: totalSessions,
    present,
    excused,
    absent: totalSessions - accepted,
    attendance_pct: attendancePct,
    avg_contribution_pts: avgContrib,
    data_available: true
  };
}

async function aggregateMenteeData(menteeIds, clanId = null) {
  if (!menteeIds || !menteeIds.length) return [];

  const menteeMemberships = await models.ClanMembership.findAll({
    where: {
      userId: { [Op.in]: menteeIds },
      role:   'mentee',
      status: 'active'
    },
    attributes: ['userId', 'clanId'],
    include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }],
    raw: false
  });

  const menteeClanMap = new Map(); 
  const allMenteeClanIds = new Set();

  for (const m of menteeMemberships) {
    if (m.userId && m.clanId) {
      if (!menteeClanMap.has(m.userId)) {
        menteeClanMap.set(m.userId, { clanId: m.clanId, clanName: m.clan?.name ?? null });
      }
      allMenteeClanIds.add(m.clanId);
    }
  }

  let clanMentorIds = null;
  let clanName      = null;

  if (clanId) {
    const clanObj = await models.Clan.findByPk(clanId, { attributes: ['id', 'name'], raw: true });
    clanName = clanObj?.name ?? null;

    const mentorMemberships = await models.ClanMembership.findAll({
      where: {
        clanId,
        role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
        status: 'active'
      },
      attributes: ['userId'],
      raw: true
    });
    clanMentorIds = mentorMemberships.map(m => m.userId);
  }

  const taskWhere = {
    menteeId: { [Op.in]: menteeIds },
    status:   { [Op.ne]: 'cancelled' }
  };
  if (clanMentorIds !== null) {
    if (clanMentorIds.length === 0) {
      taskWhere.mentorId = { [Op.in]: ['00000000-0000-0000-0000-000000000000'] };
    } else {
      taskWhere.mentorId = { [Op.in]: clanMentorIds };
    }
  }

  const tasks = await models.AssignedTask.findAll({
    where: taskWhere,
    attributes: [
      'menteeId', 'mentorId', 'status', 'pointsAwarded', 'pointsBase',
      'finalRating', 'isLate', 'completedAt', 'isCustomTask', 'dueDate',
      'titleOverride', 'descriptionOverride'
    ],
    include: [{
      model: models.RoadmapTask,
      as: 'roadmapTask',
      attributes: ['title', 'type', 'difficulty', 'description', 'pointsBase']
    }],
    raw: false
  });

  const blockers = await models.Blocker.findAll({
    where: { menteeId: { [Op.in]: menteeIds } },
    attributes: ['menteeId', 'status', 'category', 'severity', 'openedAt', 'resolvedAt'],
    raw: true
  });

  const targetClanIds = clanId ? [clanId] : [...allMenteeClanIds];
  let clanSessionsMap = new Map(); 
  let entryMap        = new Map(); 

  if (targetClanIds.length > 0) {
    const sessions = await models.CohortReviewSession.findAll({
      where: { clanId: { [Op.in]: targetClanIds }, status: 'finished' },
      attributes: ['id', 'clanId', 'sessionDate'],
      raw: true
    });

    for (const s of sessions) {
      if (!clanSessionsMap.has(s.clanId)) clanSessionsMap.set(s.clanId, []);
      clanSessionsMap.get(s.clanId).push(s);
    }

    if (sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const entries = await models.CohortReviewEntry.findAll({
        where: {
          sessionId: { [Op.in]: sessionIds },
          menteeId:  { [Op.in]: menteeIds }
        },
        attributes: ['menteeId', 'sessionId', 'attendance', 'contributionPoints'],
        raw: true
      });
      for (const e of entries) {
        entryMap.set(`${e.sessionId}:${e.menteeId}`, e);
      }
    }
  }

  const taskMap    = {};
  const blockerMap = {};
  for (const id of menteeIds) { taskMap[id] = []; blockerMap[id] = []; }
  for (const t of tasks)   taskMap[t.menteeId]?.push(t);
  for (const b of blockers) blockerMap[b.menteeId]?.push(b);

  return menteeIds.map((id) => {
    const myTasks    = taskMap[id]    || [];
    const myBlockers = blockerMap[id] || [];
    const myClanInfo = menteeClanMap.get(id);

    const resolvedClanId   = clanId || myClanInfo?.clanId || null;
    const resolvedClanName = clanName || myClanInfo?.clanName || null;

    const menteeClanSessions = resolvedClanId ? (clanSessionsMap.get(resolvedClanId) || []) : [];

    let totalBase    = 0;
    let totalAwarded = 0;
    const taskSummaries = [];

    for (const t of myTasks) {
      const taskTitle = t.titleOverride || t.roadmapTask?.title || (t.isCustomTask ? 'Custom Task' : 'Assigned Task');
      const taskDesc  = t.descriptionOverride || t.roadmapTask?.description || null;
      const base      = (t.pointsBase && t.pointsBase > 0) ? t.pointsBase : (t.roadmapTask?.pointsBase || 10);
      const awarded   = t.pointsAwarded ?? 0;

      totalBase += base;
      if (t.status === 'completed') {
        totalAwarded += Math.min(awarded, base);
      }

      taskSummaries.push({
        title:       taskTitle,
        description: taskDesc ? taskDesc.slice(0, 300) : null,
        type:        t.roadmapTask?.type ?? (t.isCustomTask ? 'custom' : 'general'),
        difficulty:  t.roadmapTask?.difficulty ?? 'medium',
        status:      t.status,
        isCustomTask: Boolean(t.isCustomTask),
        rating:      t.finalRating ? parseFloat(t.finalRating) : null,
        isLate:      t.isLate,
        pointsPct:   t.status === 'completed' && base > 0
          ? Math.round((Math.min(awarded, base) / base) * 100)
          : null
      });
    }

    const completedTasks = myTasks.filter(t => t.status === 'completed');
    const totalTasks     = myTasks.length;
    const completionRate = totalTasks > 0
      ? Math.round((completedTasks.length / totalTasks) * 100)
      : 0;

    const ratedTasks = completedTasks.filter(t => t.finalRating != null);
    const avgRating  = ratedTasks.length > 0
      ? parseFloat((ratedTasks.reduce((s, t) => s + parseFloat(t.finalRating), 0) / ratedTasks.length).toFixed(2))
      : null;

    const pointsPct  = totalBase > 0 ? Math.min(100, (totalAwarded / totalBase) * 100) : 0;
    const ratingPct  = avgRating != null ? (avgRating / 5.0) * 100 : pointsPct;
    const taskScore  = Math.round((pointsPct * 0.6) + (ratingPct * 0.4));

    const onTimePct  = computeWeightedOnTimeRate(completedTasks.map(t => ({
      isLate:     t.isLate,
      difficulty: t.roadmapTask?.difficulty ?? 'medium'
    })));

    const openBlockers     = myBlockers.filter(b => b.status !== 'resolved');
    const resolvedBlockers = myBlockers.filter(b => b.status === 'resolved');
    const blockerScore     = computeBlockerScore(openBlockers, resolvedBlockers);

    const blockersBySeverity = openBlockers.reduce((acc, b) => {
      const sev = b.severity || 'unknown';
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {});

    const cohortReviews = computeAttendance(id, menteeClanSessions, entryMap);

    let normalizedScore;
    if (cohortReviews.data_available) {
      normalizedScore = Math.round(
        (taskScore * 0.45) +
        (blockerScore * 0.15) +
        (cohortReviews.attendance_pct * 0.20) +
        (onTimePct * 0.20)
      );
    } else {
      normalizedScore = Math.round(
        (taskScore * 0.55) +
        (blockerScore * 0.20) +
        (onTimePct * 0.25)
      );
    }
    normalizedScore = Math.min(100, Math.max(0, normalizedScore));

    return {
      mentee_id:       id,
      clan_id:         resolvedClanId,
      clan_name:       resolvedClanName,
      normalized_score: normalizedScore,
      completion_rate:  completionRate,
      on_time_rate:     onTimePct,
      avg_rating:       avgRating,
      tasks:            taskSummaries,
      total_tasks:      totalTasks,
      completed_tasks:  completedTasks.length,
      score_breakdown: {
        points_pct:      Math.round(pointsPct),
        rating_pct:      Math.round(ratingPct),
        task_score:      taskScore,
        blocker_score:   blockerScore,
        on_time_pct:     onTimePct,
        attendance_pct:  cohortReviews.data_available ? cohortReviews.attendance_pct : null,
        composite:       normalizedScore
      },
      blockers: {
        total:             myBlockers.length,
        resolved:          resolvedBlockers.length,
        open:              openBlockers.length,
        open_penalty_pts:  openBlockers.reduce((s, b) => s + (SEVERITY_WEIGHT[b.severity] ?? 2), 0),
        resolved_bonus_pts: parseFloat(resolvedBlockers.reduce((s, b) => s + (SEVERITY_WEIGHT[b.severity] ?? 2) * 0.5, 0).toFixed(1)),
        blocker_score_pct: blockerScore,
        open_by_severity:  blockersBySeverity,
        resolved_by_severity: resolvedBlockers.reduce((acc, b) => {
          const sev = b.severity || 'unknown';
          acc[sev] = (acc[sev] || 0) + 1;
          return acc;
        }, {}),
        categories: [...new Set(myBlockers.map(b => b.category))]
      },
      cohort_reviews: cohortReviews
    };
  });
}

module.exports = { aggregateMenteeData };
