const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

/**
 * Cohort (intake batch) management. A cohort is a program's season of intake;
 * only an 'open' cohort accepts applications. Running an off year is simply not
 * opening a new cohort — historical cohorts stay intact and queryable.
 */
class CohortIntakeService {
  async listCohorts({ programId, status } = {}) {
    const where = {};
    if (programId) where.programId = programId;
    if (status) where.status = status;

    const cohorts = await models.Cohort.findAll({
      where,
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });

    // Attach application counts per cohort (grouped, one query).
    const ids = cohorts.map((c) => c.id);
    const counts = ids.length
      ? await models.Application.findAll({
          where: { cohortId: ids },
          attributes: ['cohortId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
          group: ['cohort_id', 'status'],
          raw: true
        })
      : [];

    const byCohort = new Map();
    for (const row of counts) {
      const m = byCohort.get(row.cohortId) || { total: 0, byStatus: {} };
      const n = Number(row.count);
      m.total += n;
      m.byStatus[row.status] = n;
      byCohort.set(row.cohortId, m);
    }

    return cohorts.map((c) => {
      const json = c.toJSON();
      const stat = byCohort.get(c.id) || { total: 0, byStatus: {} };
      return { ...json, applicationCount: stat.total, applicationsByStatus: stat.byStatus };
    });
  }

  async getCohort(cohortId) {
    const cohort = await models.Cohort.findByPk(cohortId, {
      include: [{ model: models.Program, as: 'program', attributes: ['id', 'name', 'status', 'visibility'] }]
    });
    if (!cohort) throw new NotFoundError('Cohort not found');
    return cohort;
  }

  async createCohort(data, createdBy) {
    const { programId, name } = data;
    if (!programId || !name) throw new ValidationError('programId and name are required');

    const program = await models.Program.findByPk(programId);
    if (!program) throw new NotFoundError('Program not found');

    return models.Cohort.create({
      programId,
      name: name.trim(),
      description: data.description || null,
      status: data.status || 'planning',
      capacity: data.capacity ?? null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      createdBy
    });
  }

  async updateCohort(cohortId, data) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    const allowed = ['name', 'description', 'status', 'capacity', 'startDate', 'endDate'];
    const patch = {};
    for (const key of allowed) {
      if (data[key] !== undefined) patch[key] = data[key];
    }
    await cohort.update(patch);
    return cohort;
  }
}

module.exports = new CohortIntakeService();
