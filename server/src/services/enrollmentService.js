const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const groqService = require('./groqService');

class EnrollmentService {
  /**
   * Return overall enrollment counts by status group.
   * Runs COUNT queries across the full table — never paginated.
   */
  async getEnrollmentStats() {
    const [total, active, pendingMatch, pendingCompletion, completed, dropped] = await Promise.all([
      models.Enrollment.count(),
      models.Enrollment.count({ where: { status: ['active', 'matched'] } }),
      models.Enrollment.count({ where: { status: ['pending_match', 'approved'] } }),
      models.Enrollment.count({ where: { status: 'pending_completion' } }),
      models.Enrollment.count({ where: { status: ['program_completed', 'level_completed'] } }),
      models.Enrollment.count({ where: { status: ['dropped', 'rejected'] } }),
    ]);

    return { total, active, pendingMatch, pendingCompletion, completed, dropped };
  }

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
          as: 'program'
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
    const program = await models.Program.findByPk(programId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Programs are private/invite-driven now; admins may enroll into any
    // program that isn't closed out. Only archived/completed are off-limits.
    if (['archived', 'completed'].includes(program.status)) {
      throw new ValidationError('Program is not open for enrollment');
    }

    if (!menteeId) {
      throw new ValidationError('A mentee is required to create an enrollment');
    }

    // Check if already enrolled
    const existingEnrollment = await models.Enrollment.findOne({
      where: { menteeId, programId }
    });

    if (existingEnrollment) {
      throw new ConflictError('Already enrolled in this program');
    }

    // Create enrollment (enrollment is to a program; levels were removed).
    const enrollment = await models.Enrollment.create({
      menteeId,
      programId,
      status: 'pending_match',
      enrolledAt: new Date()
    });

    const admins = await models.User.findAll({
      where: { role: 'admin', status: 'active' },
      attributes: ['id']
    });

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MENTEE_ENROLLED,
      recipients: [{ userId: menteeId }],
      payload: {
        title: 'Program enrollment created',
        message: `A new enrollment was created for "${program.name}".`,
        actionUrl: `/mentee/programs`,
        actionLabel: 'View Programs',
        relatedEntityType: 'enrollment',
        relatedEntityId: enrollment.id,
        emailSubject: 'Pathment: Enrollment confirmed'
      },
      dedupe: {
        relatedEntityType: 'enrollment_created',
        relatedEntityId: enrollment.id
      }
    });

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MENTEE_ENROLLED,
      recipients: admins.map((admin) => ({ userId: admin.id })),
      payload: {
        title: 'Program enrollment created',
        message: `A new enrollment was created for "${program.name}".`,
        actionUrl: `/admin/enrollment/overview`,
        actionLabel: 'View Enrollment',
        relatedEntityType: 'enrollment',
        relatedEntityId: enrollment.id,
        emailSubject: 'Pathment: New program enrollment'
      },
      dedupe: {
        relatedEntityType: 'enrollment_created',
        relatedEntityId: enrollment.id
      }
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

    const validStatuses = ['pending_match', 'matched', 'active', 'approved', 'rejected', 'pending_completion', 'level_completed', 'program_completed', 'dropped'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    await enrollment.update({ status });
    return this.getEnrollmentById(enrollmentId);
  }

  /**
   * Mentee or Mentor requests completion of the current level/program.
   * Sets status to pending_completion and records who requested it.
   */
  async requestCompletion(enrollmentId, requestedById, requestedByRole) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId);
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    // Only mentee can self-request; mentor can also request on behalf of mentee
    if (requestedByRole === 'mentee' && enrollment.menteeId !== requestedById) {
      throw new ForbiddenError('Not authorized to request completion for this enrollment');
    }

    if (requestedByRole === 'mentor') {
      // Verify this mentor is actively paired with this enrollment
      const match = await models.MentorMenteeMatch.findOne({
        where: { enrollmentId, mentorId: requestedById, status: 'active' }
      });
      if (!match) throw new ForbiddenError('You are not the active mentor for this enrollment');
    }

    if (!['active', 'matched'].includes(enrollment.status)) {
      throw new ValidationError(`Cannot request completion from status: ${enrollment.status}`);
    }

    await enrollment.update({
      status: 'pending_completion',
      completionRequestedAt: new Date(),
      completionRequestedBy: requestedById,
      completionRequestedByRole: requestedByRole,
      completionRejectionReason: null
    });

    return this.getEnrollmentById(enrollmentId);
  }

  /**
   * Mentor or Admin approves the completion request → the program is complete.
   * (Levels were removed, so there is no intermediate level-by-level promotion.)
   */
  async approveCompletion(enrollmentId, approverId, approverRole) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId);
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    if (!['pending_completion', 'matched', 'active'].includes(enrollment.status)) {
      throw new ValidationError('Enrollment is not in a state that can be approved for completion');
    }

    if (approverRole === 'mentor') {
      const match = await models.MentorMenteeMatch.findOne({
        where: { enrollmentId, mentorId: approverId, status: 'active' }
      });
      if (!match) throw new ForbiddenError('You are not the active mentor for this enrollment');
    }

    await enrollment.update({
      status: 'program_completed',
      completionApprovedAt: new Date(),
      completionApprovedBy: approverId,
      completionApprovedByRole: approverRole,
      completedAt: new Date()
    });

    return {
      enrollment: await this.getEnrollmentById(enrollmentId),
      hasNextLevel: false,
      programCompleted: true
    };
  }

  /**
   * Mentor or Admin rejects the completion request.
   * Returns the enrollment back to active with a reason.
   */
  async rejectCompletion(enrollmentId, rejecterId, rejecterRole, reason) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId);
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    if (!['pending_completion', 'matched', 'active'].includes(enrollment.status)) {
      throw new ValidationError('Enrollment is not in a state where completion can be rejected');
    }

    if (rejecterRole === 'mentor') {
      const match = await models.MentorMenteeMatch.findOne({
        where: { enrollmentId, mentorId: rejecterId, status: 'active' }
      });
      if (!match) throw new ForbiddenError('You are not the active mentor for this enrollment');
    }

    await enrollment.update({
      status: 'matched',
      completionRejectionReason: reason || 'Completion request rejected',
      completionRequestedAt: null,
      completionRequestedBy: null,
      completionRequestedByRole: null
    });

    return this.getEnrollmentById(enrollmentId);
  }

  /**
   * Remove (unenroll) a mentee from a program. Admin-only.
   * Cancels any active match and deletes all associated assigned tasks.
   */
  async removeEnrollment(enrollmentId, adminUserId) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
      ],
    });

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    // Cancel all active matches
    await models.MentorMenteeMatch.update(
      { status: 'cancelled' },
      { where: { enrollmentId, status: 'active' } }
    );

    // Delete all assigned tasks for this enrollment
    await models.AssignedTask.destroy({ where: { enrollmentId } });

    await enrollment.destroy();

    return { message: 'Enrollment removed successfully' };
  }
}

module.exports = new EnrollmentService();
