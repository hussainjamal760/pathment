const { models } = require('../db');
const { Op, fn, col } = require('sequelize');
const { catchAsync } = require('../middlewares/errorHandler');
const { NotFoundError } = require('../utils/errors/errorTypes');

/**
 * Get all active mentors
 */
const getAllMentors = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20, accepting } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  // Include suspended mentors so they stay visible and can be UNsuspended
  // (active-only filtering made a just-suspended person disappear from the list).
  const where = { role: 'mentor', status: { [Op.in]: ['active', 'suspended'] } };

  const searchConditions = search ? {
    [Op.or]: [
      { firstName: { [Op.iLike]: `%${search}%` } },
      { lastName: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } }
    ]
  } : {};

  // Build mentor profile include - optionally filter by accepting status
  const mentorProfileInclude = {
    model: models.MentorProfile,
    as: 'mentorProfile',
    attributes: [
      'specialization', 'maxMentees', 'currentMenteeCount', 'title', 'organization',
      'isAcceptingMentees', 'avgFeedbackRating', 'totalMenteesGuided', 'yearsOfExperience',
    ],
  };

  if (accepting === 'true' || accepting === 'false') {
    mentorProfileInclude.where = { isAcceptingMentees: accepting === 'true' };
    mentorProfileInclude.required = true;
  }

  const { count, rows: mentors } = await models.User.findAndCountAll({
    where: { ...where, ...searchConditions },
    attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'createdAt', 'lastLoginAt'],
    include: [mentorProfileInclude],
    order: [['firstName', 'ASC']],
    limit: limitNum,
    offset,
    distinct: true,
  });

  // Attach each mentor's clans (lead/co-mentor) + skills (specializations) via
  // batched queries — so the admin table shows which clans they run + expertise
  // without row-multiplying the paginated list.
  const mentorIds = mentors.map((m) => m.id);
  const [clanRows, skillUsers] = mentorIds.length ? await Promise.all([
    models.ClanMembership.findAll({
      where: { userId: { [Op.in]: mentorIds }, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
      include: [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }],
    }),
    models.User.findAll({
      where: { id: { [Op.in]: mentorIds } }, attributes: ['id'],
      include: [{ model: models.Skill, as: 'skills', attributes: ['name'], through: { attributes: [] } }],
    }),
  ]) : [[], []];
  const clansByUser = new Map();
  for (const m of clanRows) {
    if (!m.clan) continue;
    const arr = clansByUser.get(m.userId) || [];
    arr.push({ id: m.clan.id, name: m.clan.name, role: m.role });
    clansByUser.set(m.userId, arr);
  }
  const skillsByUser = new Map(skillUsers.map((u) => [u.id, (u.skills || []).map((s) => s.name)]));

  // Active mentees per mentor = sum of active mentees across the clans they run.
  const allClanIds = [...new Set(clanRows.map((r) => r.clanId).filter(Boolean))];
  const menteeCountRows = allClanIds.length ? await models.ClanMembership.findAll({
    where: { clanId: { [Op.in]: allClanIds }, role: 'mentee', status: 'active' },
    attributes: ['clanId', [fn('COUNT', col('id')), 'n']], group: ['clanId'], raw: true,
  }) : [];
  const countByClan = new Map(menteeCountRows.map((r) => [r.clanId, Number(r.n)]));
  const menteesByUser = new Map();
  for (const m of clanRows) {
    menteesByUser.set(m.userId, (menteesByUser.get(m.userId) || 0) + (countByClan.get(m.clanId) || 0));
  }

  const mentorRows = mentors.map((m) => {
    const json = m.toJSON();
    json.clans = clansByUser.get(m.id) || [];
    json.specializations = skillsByUser.get(m.id) || [];
    json.activeMentees = menteesByUser.get(m.id) || 0;
    return json;
  });

  res.status(200).json({
    status: 'success',
    data: { mentors: mentorRows },
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
    },
  });
});

/**
 * Get a single mentor's full profile (admin)
 */
const getMentorById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const mentor = await models.User.findOne({
    where: { id, role: 'mentor' },
    attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'createdAt'],
    include: [
      {
        model: models.MentorProfile,
        as: 'mentorProfile',
        attributes: [
          'title', 'organization', 'yearsOfExperience',
          'specialization', 'linkedinUrl', 'githubUrl', 'portfolioUrl',
          'maxMentees', 'currentMenteeCount', 'avgResponseTimeHours',
          'totalMenteesGuided', 'successRate', 'avgFeedbackRating',
          'totalTasksReviewed', 'isAcceptingMentees', 'preferredMenteeLevel'
        ]
      },
      {
        model: models.Skill,
        as: 'skills',
        attributes: ['id', 'name', 'category'],
        through: { attributes: ['proficiencyLevel'] }
      }
    ]
  });

  if (!mentor) throw new NotFoundError('Mentor not found');

  // ── Live stats (stored columns are never updated so we compute them here) ──
  const allMatches = await models.MentorMenteeMatch.findAll({
    where: { mentorId: id },
    attributes: ['menteeSatisfactionRating'],
    include: [{
      model: models.Enrollment,
      as: 'enrollment',
      attributes: ['status'],
      required: false,
    }],
  }).catch(() => []);

  const totalMenteesGuided = allMatches.length;

  const completedCount = allMatches.filter(
    m => m.enrollment?.status === 'program_completed'
  ).length;

  const successRate = totalMenteesGuided > 0
    ? parseFloat(((completedCount / totalMenteesGuided) * 100).toFixed(1))
    : 0;

  const ratedMatches = allMatches.filter(m => m.menteeSatisfactionRating != null);
  const avgFeedbackRating = ratedMatches.length > 0
    ? parseFloat(
        (ratedMatches.reduce((sum, m) => sum + parseFloat(m.menteeSatisfactionRating), 0) / ratedMatches.length).toFixed(1)
      )
    : null;

  // Fetch active matches - match must be active AND enrollment must not be terminated.
  // Matches are sometimes left in 'active' state even after the enrollment reaches
  // program_completed or dropped, so we exclude those enrollment statuses explicitly.
  const TERMINAL_ENROLLMENT_STATUSES = ['program_completed', 'dropped', 'rejected', 'withdrawn'];

  const activeMatches = await models.MentorMenteeMatch.findAll({
    attributes: ['id', 'status', 'matchedAt'],
    where: { mentorId: id, status: 'active' },
    include: [
      {
        model: models.User,
        as: 'mentee',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
      {
        model: models.Enrollment,
        as: 'enrollment',
        attributes: ['id', 'status', 'overallProgressPercentage'],
        where: { status: { [Op.notIn]: TERMINAL_ENROLLMENT_STATUSES } },
        required: true,
        include: [{
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name'],
        }],
      },
    ],
    order: [['matchedAt', 'DESC']],
    limit: 20,
  }).catch(() => []);

  const mentorJson = mentor.toJSON();
  // Override stale stored stats with live-computed values
  if (mentorJson.mentorProfile) {
    mentorJson.mentorProfile.totalMenteesGuided = totalMenteesGuided;
    mentorJson.mentorProfile.successRate = successRate;
    mentorJson.mentorProfile.avgFeedbackRating = avgFeedbackRating;
  }

  res.status(200).json({
    success: true,
    message: 'Mentor profile retrieved successfully',
    statusCode: 200,
    data: {
      mentor: mentorJson,
      activeMatches
    }
  });
});

module.exports = {
  getAllMentors,
  getMentorById
};
