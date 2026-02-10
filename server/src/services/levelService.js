const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');

class LevelService {
  /**
   * Create program level
   */
  async createLevel(programId, data, userId, userRole) {
    const program = await models.Program.findByPk(programId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Check permissions
    if (userRole !== 'admin' && program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to add levels to this program');
    }

    const levelOrder = data.orderIndex ?? data.levelOrder;

    // Check if a level with the same order already exists for this program
    const existingLevelByOrder = await models.ProgramLevel.findOne({
      where: { programId, levelOrder }
    });

    if (existingLevelByOrder) {
      throw new ValidationError(`A level with order ${levelOrder} already exists for this program`);
    }

    // Check if a level with the same name already exists for this program
    const existingLevelByName = await models.ProgramLevel.findOne({
      where: { programId, name: data.name }
    });

    if (existingLevelByName) {
      throw new ValidationError(`A level with the name "${data.name}" already exists for this program`);
    }

    const level = await models.ProgramLevel.create({
      programId,
      name: data.name,
      description: data.description,
      levelOrder: levelOrder,
      durationWeeks: data.durationWeeks,
      learningOutcomes: data.learningOutcomes || [],
      prerequisites: data.prerequisites || [],
      targetAudience: data.targetAudience,
      isOptional: data.isOptional
    });

    return level;
  }

  /**
   * Get all levels for a program
   */
  async getProgramLevels(programId) {
    const levels = await models.ProgramLevel.findAll({
      where: { programId },
      include: [
        {
          model: models.Roadmap,
          as: 'roadmaps',
          attributes: ['id', 'name', 'totalWeeks', 'generatedByAi', 'isBaseRoadmap']
        }
      ],
      order: [['levelOrder', 'ASC']]
    });

    return levels;
  }

  /**
   * Update level
   */
  async updateLevel(levelId, data, userId, userRole) {
    const level = await models.ProgramLevel.findByPk(levelId, {
      include: [{ model: models.Program, as: 'program' }]
    });

    if (!level) {
      throw new NotFoundError('Level not found');
    }

    // Check permissions
    if (userRole !== 'admin' && level.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to update this level');
    }

    // If updating levelOrder, check for conflicts
    const newLevelOrder = data.orderIndex ?? data.levelOrder;
    if (newLevelOrder !== undefined && newLevelOrder !== level.levelOrder) {
      const existingLevelByOrder = await models.ProgramLevel.findOne({
        where: { 
          programId: level.programId, 
          levelOrder: newLevelOrder,
          id: { [models.Sequelize.Op.ne]: levelId }
        }
      });

      if (existingLevelByOrder) {
        throw new ValidationError(`A level with order ${newLevelOrder} already exists for this program`);
      }
    }

    // If updating name, check for conflicts
    if (data.name && data.name !== level.name) {
      const existingLevelByName = await models.ProgramLevel.findOne({
        where: { 
          programId: level.programId, 
          name: data.name,
          id: { [models.Sequelize.Op.ne]: levelId }
        }
      });

      if (existingLevelByName) {
        throw new ValidationError(`A level with the name "${data.name}" already exists for this program`);
      }
    }

    // Prepare update data
    const updateData = { ...data };
    if (newLevelOrder !== undefined) {
      updateData.levelOrder = newLevelOrder;
      delete updateData.orderIndex;
    }

    await level.update(updateData);
    return level;
  }

  /**
   * Delete level
   */
  async deleteLevel(levelId, userId, userRole) {
    const level = await models.ProgramLevel.findByPk(levelId, {
      include: [{ model: models.Program, as: 'program' }]
    });

    if (!level) {
      throw new NotFoundError('Level not found');
    }

    // Check permissions
    if (userRole !== 'admin' && level.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to delete this level');
    }

    // Check if level has active enrollments
    const activeEnrollments = await models.Enrollment.count({
      where: {
        programId: level.programId,
        currentLevel: level.name
      }
    });

    if (activeEnrollments > 0) {
      throw new ValidationError(
        `Cannot delete level with ${activeEnrollments} active enrollments`
      );
    }

    await level.destroy();
    return { message: 'Level deleted successfully' };
  }

  /**
   * Assign mentor to level
   */
  async assignMentorToLevel(levelId, mentorId, userId, userRole) {
    const level = await models.ProgramLevel.findByPk(levelId, {
      include: [{ model: models.Program, as: 'program' }]
    });

    if (!level) {
      throw new NotFoundError('Level not found');
    }

    // Check permissions
    if (userRole !== 'admin' && level.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to assign mentors');
    }

    // Verify mentor exists and has mentor profile
    const mentor = await models.User.findByPk(mentorId, {
      include: [{ model: models.MentorProfile, as: 'mentorProfile' }]
    });

    if (!mentor || !mentor.mentorProfile) {
      throw new NotFoundError('Mentor not found or does not have a mentor profile');
    }

    // Check if already assigned
    const existing = await models.LevelMentorAssignment.findOne({
      where: { levelId, mentorId }
    });

    if (existing) {
      throw new ValidationError('Mentor is already assigned to this level');
    }

    const assignment = await models.LevelMentorAssignment.create({
      levelId,
      mentorId,
      assignedBy: userId,
      assignedAt: new Date()
    });

    return assignment;
  }

  /**
   * Remove mentor from level
   */
  async removeMentorFromLevel(assignmentId, userId, userRole) {
    const assignment = await models.LevelMentorAssignment.findByPk(assignmentId, {
      include: [
        {
          model: models.ProgramLevel,
          as: 'level',
          include: [{ model: models.Program, as: 'program' }]
        }
      ]
    });

    if (!assignment) {
      throw new NotFoundError('Assignment not found');
    }

    // Check permissions
    if (userRole !== 'admin' && assignment.level.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to remove this assignment');
    }

    await assignment.destroy();
    return { message: 'Mentor removed from level successfully' };
  }

  /**
   * Get mentors assigned to a level
   */
  async getLevelMentors(levelId) {
    const assignments = await models.LevelMentorAssignment.findAll({
      where: { levelId },
      include: [
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          include: [
            {
              model: models.MentorProfile,
              as: 'mentorProfile'
            }
          ]
        }
      ]
    });

    return assignments;
  }

  /**
   * Get level by ID
   */
  async getLevelById(levelId) {
    const level = await models.ProgramLevel.findByPk(levelId, {
      include: [
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name', 'type', 'status']
        },
        {
          model: models.Roadmap,
          as: 'roadmaps',
          attributes: ['id', 'totalWeeks', 'generatedBy', 'adaptationLevel']
        }
      ]
    });

    if (!level) {
      throw new NotFoundError('Level not found');
    }

    return level;
  }

  /**
   * Reorder levels
   */
  async reorderLevels(programId, levelIds, userId, userRole) {
    const program = await models.Program.findByPk(programId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Check permissions
    if (userRole !== 'admin' && program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to reorder levels');
    }

    // Verify all level IDs belong to this program
    const levels = await models.ProgramLevel.findAll({
      where: {
        id: levelIds,
        programId
      }
    });

    if (levels.length !== levelIds.length) {
      throw new ValidationError('Some level IDs do not belong to this program');
    }

    // Update order indexes
    for (let i = 0; i < levelIds.length; i++) {
      await models.ProgramLevel.update(
        { orderIndex: i },
        { where: { id: levelIds[i] } }
      );
    }

    return { message: 'Levels reordered successfully' };
  }
}

module.exports = new LevelService();
