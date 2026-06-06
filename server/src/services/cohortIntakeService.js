const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

/**
 * Cohort (intake batch) management. A cohort is a program's season of intake;
 * only an 'open' cohort accepts applications. Running an off year is simply not
 * opening a new cohort - historical cohorts stay intact and queryable.
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

  /** Validate date ordering + positive capacities. Throws on bad config. */
  _validateCohortConfig({ startDate, endDate, applyOpensAt, applyClosesAt, capacity, maxApplications }) {
    const day = (d) => (d ? new Date(d) : null);
    const s = day(startDate), e = day(endDate), ao = day(applyOpensAt), ac = day(applyClosesAt);
    if (s && e && s > e) throw new ValidationError('Start date must be on or before the end date');
    if (ao && ac && ao > ac) throw new ValidationError('Applications must open on or before they close');
    if (capacity != null && capacity !== '' && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)) {
      throw new ValidationError('Capacity must be a whole number ≥ 1');
    }
    if (maxApplications != null && maxApplications !== '' && (!Number.isInteger(Number(maxApplications)) || Number(maxApplications) < 1)) {
      throw new ValidationError('Max applications must be a whole number ≥ 1');
    }
  }

  async createCohort(data, createdBy) {
    const { programId, name } = data;
    if (!programId || !name) throw new ValidationError('programId and name are required');

    const program = await models.Program.findByPk(programId);
    if (!program) throw new NotFoundError('Program not found');
    this._validateCohortConfig(data);

    return models.Cohort.create({
      programId,
      name: name.trim(),
      description: data.description || null,
      status: data.status || 'planning',
      capacity: (data.capacity ?? '') === '' ? null : Number(data.capacity),
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      createdBy
    });
  }

  async updateCohort(cohortId, data) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    const allowed = [
      'name', 'description', 'status', 'capacity', 'startDate', 'endDate',
      // public intake link + assessment configuration
      'applyOpensAt', 'applyClosesAt', 'maxApplications', 'intakeFormSchema',
      'assessmentId', 'assessmentRequired'
    ];
    const patch = {};
    for (const key of allowed) {
      if (data[key] !== undefined) patch[key] = data[key];
    }

    // Validate ordering/capacity against the MERGED config (so updating one date
    // is checked against the other's existing value).
    this._validateCohortConfig({
      startDate: patch.startDate ?? cohort.startDate,
      endDate: patch.endDate ?? cohort.endDate,
      applyOpensAt: patch.applyOpensAt ?? cohort.applyOpensAt,
      applyClosesAt: patch.applyClosesAt ?? cohort.applyClosesAt,
      capacity: patch.capacity ?? cohort.capacity,
      maxApplications: patch.maxApplications ?? cohort.maxApplications,
    });

    // Validate an attached assessment exists and is usable.
    const finalAssessmentId = patch.assessmentId !== undefined ? patch.assessmentId : cohort.assessmentId;
    const finalRequired = patch.assessmentRequired !== undefined ? patch.assessmentRequired : cohort.assessmentRequired;
    if (patch.assessmentId) {
      const assessment = await models.Assessment.findByPk(patch.assessmentId);
      if (!assessment) throw new ValidationError('Attached assessment not found');
    }
    // A REQUIRED assessment must be published (and therefore non-empty) — you
    // can't gate applicants behind a draft/empty assessment.
    if (finalRequired && finalAssessmentId) {
      const assessment = await models.Assessment.findByPk(finalAssessmentId);
      if (!assessment) throw new ValidationError('Attached assessment not found');
      if (assessment.status !== 'published') {
        throw new ValidationError('Publish the assessment before marking it required for this cohort');
      }
    }
    await cohort.update(patch);
    return cohort;
  }

  /**
   * Turn the public self-serve intake link on for a cohort, minting a slug the
   * first time. Returns the cohort + the absolute apply URL.
   */
  async enablePublicLink(cohortId) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');

    if (!cohort.publicSlug) {
      // Short, URL-safe, unguessable slug. Retry on the rare collision.
      let slug;
      for (let i = 0; i < 5; i += 1) {
        slug = crypto.randomBytes(9).toString('base64url');
        const clash = await models.Cohort.findOne({ where: { publicSlug: slug } });
        if (!clash) break;
        slug = null;
      }
      if (!slug) throw new ValidationError('Could not generate a unique link, try again');
      cohort.publicSlug = slug;
    }
    cohort.publicEnabled = true;
    await cohort.save();
    return { cohort, applyUrl: this.buildApplyUrl(cohort.publicSlug) };
  }

  async disablePublicLink(cohortId) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    cohort.publicEnabled = false;
    await cohort.save();
    return cohort;
  }

  /**
   * Copy the intake CONFIG (application form fields + attached assessment) from
   * one cohort onto another - so a new season isn't rebuilt from scratch. Does
   * NOT copy the public slug, status, window, or applications. Idempotent: same
   * source → same result.
   */
  async cloneIntakeFrom(targetCohortId, sourceCohortId) {
    if (targetCohortId === sourceCohortId) throw new ValidationError('Pick a different cohort to copy from');
    const [target, source] = await Promise.all([
      models.Cohort.findByPk(targetCohortId),
      models.Cohort.findByPk(sourceCohortId)
    ]);
    if (!target) throw new NotFoundError('Cohort not found');
    if (!source) throw new NotFoundError('Source cohort not found');

    await target.update({
      intakeFormSchema: source.intakeFormSchema || [],
      assessmentId: source.assessmentId || null,
      assessmentRequired: source.assessmentRequired || false
    });
    return target;
  }

  buildApplyUrl(slug) {
    const base = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    return `${base}/apply/${slug}`;
  }

  /**
   * Resolve a public slug to a cohort *only if the link is currently accepting
   * applications*: enabled, status 'open', inside the optional window, and under
   * the optional application cap. Returns null when the link should not resolve.
   */
  async getOpenCohortBySlug(slug) {
    if (!slug) return null;
    const cohort = await models.Cohort.findOne({
      where: { publicSlug: slug },
      include: [
        { model: models.Program, as: 'program', attributes: ['id', 'name', 'description', 'type'] },
        { model: models.Assessment, as: 'assessment', attributes: ['id', 'title', 'description', 'instructions', 'timeLimitMins', 'status'] }
      ]
    });
    if (!cohort) return null;

    const now = new Date();
    const reasons = [];
    if (!cohort.publicEnabled) reasons.push('disabled');
    if (cohort.status !== 'open') reasons.push('not_open');
    if (cohort.applyOpensAt && now < new Date(cohort.applyOpensAt)) reasons.push('not_yet_open');
    if (cohort.applyClosesAt && now > new Date(cohort.applyClosesAt)) reasons.push('closed');

    if (cohort.maxApplications != null) {
      const count = await models.Application.count({ where: { cohortId: cohort.id } });
      if (count >= cohort.maxApplications) reasons.push('full');
    }

    return { cohort, open: reasons.length === 0, reasons };
  }
}

module.exports = new CohortIntakeService();
