const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../utils/errors/errorTypes');

class EnrollmentService {
  async getEnrollments(filters, pagination) {
    const { status, programId, menteeId, search } = filters;
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (programId) where.programId = programId;
    if (menteeId) where.menteeId = menteeId;

    // Server-side search across mentee name, email and program name.
    // Uses $association.column$ syntax so Sequelize can push the filter
    // to the JOIN — requires subQuery: false + distinct: true below.
    if (search && search.trim()) {
      const like = `%${search.trim()}%`;
      where[Op.or] = [
        { '$mentee.first_name$': { [Op.iLike]: like } },
        { '$mentee.last_name$': { [Op.iLike]: like } },
        { '$mentee.email$':     { [Op.iLike]: like } },
        { '$program.name$':     { [Op.iLike]: like } },
      ];
    }

    const { rows, count } = await models.Enrollment.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          include: [{
            model: models.MenteeProfile,
            as: 'menteeProfile',
            attributes: ['learningGoals', 'interests', 'priorExperience', 'currentEducation', 'currentOccupation']
          }]
        },
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name', 'type', 'status']
        },
        {
          model: models.ProgramLevel,
          as: 'currentLevel',
          attributes: ['id', 'name', 'durationWeeks']
        },
        {
          model: models.MentorMenteeMatch,
          as: 'matches',
          where: { status: 'active' },
          required: false,
          include: [{
            model: models.User,
            as: 'mentor',
            attributes: ['id', 'firstName', 'lastName', 'email']
          }]
        }
      ],
      limit,
      offset,
      order: [['enrolledAt', 'DESC']],
      // distinct: true ensures the count reflects unique Enrollment rows
      // even when matches (hasMany) produces duplicate rows in the JOIN.
      // subQuery: false is required so Sequelize can filter on included
      // model columns ($mentee.first_name$, $program.name$, etc.).
      distinct: true,
      subQuery: false,
    });

    return {
      enrollments: rows,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    };
  }

  async getEnrollmentById(enrollmentId) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          include: [{
            model: models.MenteeProfile,
            as: 'menteeProfile'
          }]
        },
        {
          model: models.Program,
          as: 'program',
          include: [{
            model: models.ProgramLevel,
            as: 'levels',
            order: [['orderIndex', 'ASC']]
          }]
        },
        {
          model: models.ProgramLevel,
          as: 'currentLevel'
        }
      ]
    });

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    return enrollment;
  }

  async createEnrollment(programId, menteeId) {
    // Check if program exists and is active
    const program = await models.Program.findByPk(programId, {
      include: [{
        model: models.ProgramLevel,
        as: 'levels',
        order: [['orderIndex', 'ASC']]
      }]
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (program.status !== 'published') {
      throw new ValidationError('Program is not available for enrollment');
    }

    // Check if already enrolled
    const existingEnrollment = await models.Enrollment.findOne({
      where: { menteeId, programId }
    });

    if (existingEnrollment) {
      throw new ConflictError('Already enrolled in this program');
    }

    // Get first level
    const firstLevel = program.levels && program.levels.length > 0 ? program.levels[0] : null;

    // Create enrollment
    const enrollment = await models.Enrollment.create({
      menteeId,
      programId,
      currentLevelId: firstLevel?.id,
      status: 'pending_match',
      enrolledAt: new Date()
    });

    return this.getEnrollmentById(enrollment.id);
  }

  async updateEnrollmentStatus(enrollmentId, status, userId, userRole) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId);

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    // Only admin or the mentee can update status
    if (userRole !== 'admin' && enrollment.menteeId !== userId) {
      throw new ForbiddenError('Not authorized to update this enrollment');
    }

    const validStatuses = ['pending_match', 'matched', 'active', 'approved', 'rejected', 'level_completed', 'program_completed', 'dropped'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    await enrollment.update({ status });
    return this.getEnrollmentById(enrollmentId);
  }
}

module.exports = new EnrollmentService();
