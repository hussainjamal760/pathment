const { models } = require('../db');
const { NotFoundError, ForbiddenError } = require('../utils/errors/errorTypes');

class TaskTemplateService {
  async createTemplate(mentorId, data) {
    const template = await models.TaskTemplate.create({
      mentorId,
      title: data.title,
      description: data.description,
      type: data.type || 'custom',
      difficulty: data.difficulty || 'medium',
      deliverable: data.deliverable || '',
      acceptanceCriteria: data.acceptanceCriteria || [],
      estimatedHours: data.estimatedHours || 5,
      pointsBase: data.pointsBase || 10
    });

    return template;
  }

  async getTemplatesByMentor(mentorId) {
    return models.TaskTemplate.findAll({
      where: { mentorId },
      order: [['createdAt', 'DESC']]
    });
  }

  async getTemplateById(templateId, mentorId) {
    const template = await models.TaskTemplate.findByPk(templateId);

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    if (template.mentorId !== mentorId) {
      throw new ForbiddenError('You do not own this template');
    }

    return template;
  }

  async updateTemplate(templateId, mentorId, updateData) {
    const template = await this.getTemplateById(templateId, mentorId);

    const allowed = ['title', 'description', 'type', 'difficulty', 'deliverable', 'acceptanceCriteria', 'estimatedHours', 'pointsBase'];
    const filtered = {};
    for (const key of allowed) {
      if (updateData[key] !== undefined) {
        filtered[key] = updateData[key];
      }
    }

    await template.update(filtered);
    return template;
  }

  async deleteTemplate(templateId, mentorId) {
    const template = await this.getTemplateById(templateId, mentorId);
    await template.destroy();
    return { message: 'Template deleted' };
  }
}

module.exports = new TaskTemplateService();
