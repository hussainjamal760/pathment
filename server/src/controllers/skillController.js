const { models } = require('../db');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');
const { ValidationError } = require('../utils/errors/errorTypes');

class SkillController {
  /**
   * Get all skills
   * GET /api/skills
   */
  getAllSkills = catchAsync(async (req, res) => {
    const { category, search } = req.query;
    const where = {};

    if (category) {
      where.category = category;
    }

    if (search) {
      where.name = { [models.Sequelize.Op.iLike]: `%${search}%` };
    }

    const skills = await models.Skill.findAll({
      where,
      order: [['category', 'ASC'], ['name', 'ASC']]
    });

    res.json(successResponse('Skills retrieved successfully', skills));
  });

  /**
   * Get skill categories
   * GET /api/skills/categories
   */
  getCategories = catchAsync(async (req, res) => {
    const categories = await models.Skill.findAll({
      attributes: [
        [models.Sequelize.fn('DISTINCT', models.Sequelize.col('category')), 'category']
      ],
      raw: true
    });

    const categoryList = categories.map(c => c.category).filter(Boolean);

    res.json(successResponse('Categories retrieved successfully', categoryList));
  });

  /**
   * Get user skills
   * GET /api/skills/user
   */
  getUserSkills = catchAsync(async (req, res) => {
    const userId = req.user.id;

    const user = await models.User.findByPk(userId, {
      include: [
        {
          model: models.Skill,
          as: 'skills',
          through: {
            attributes: ['proficiencyLevel', 'yearsOfExperience', 'createdAt']
          }
        }
      ]
    });

    res.json(successResponse('User skills retrieved successfully', user.skills));
  });

  /**
   * Create new skill (admin only)
   * POST /api/skills
   */
  createSkill = catchAsync(async (req, res) => {
    const { name, category, description } = req.body;

    if (!name || !category) {
      throw new ValidationError('Name and category are required');
    }

    const skill = await models.Skill.create({
      name,
      category,
      description
    });

    res.status(201).json(successResponse('Skill created successfully', skill, 201));
  });
}

module.exports = new SkillController();
