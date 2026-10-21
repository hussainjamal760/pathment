const Joi = require('joi');

const component = Joi.object({
  key: Joi.string().trim().max(40).optional(),
  label: Joi.string().trim().min(1).max(80).required().messages({ 'any.required': 'Name each scoring component' }),
  weight: Joi.number().min(0).max(100).required()
});

const poolFields = {
  name: Joi.string().trim().min(1).max(150),
  description: Joi.string().trim().max(4000).allow('', null),
  cohortId: Joi.string().uuid().allow(null),
  capacity: Joi.number().integer().min(1).max(100000).allow(null),
  selectionQuota: Joi.number().integer().min(1).max(100000),
  opensAt: Joi.date().iso().allow(null),
  closesAt: Joi.date().iso().allow(null),
  qualificationDueAt: Joi.date().iso().allow(null),
  components: Joi.array().items(component).max(12),
  awardPoints: Joi.boolean(),
  reminderPolicy: Joi.object({
    enabled: Joi.boolean(),
    inviteAfterDays: Joi.number().integer().min(1).max(30),
    inactivityDays: Joi.number().integer().min(1).max(60)
  })
};

/** Payloads for /api/pools. Business rules (states, capacity, ties) live in poolService. */
module.exports = {
  idParams: Joi.object({ id: Joi.string().uuid().required() }),
  dashboardQuery: Joi.object({
    q: Joi.string().trim().max(200).allow(''),
    bucket: Joi.string().max(40),
    decision: Joi.string().max(120),
    ranked: Joi.boolean(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(200)
  }),
  memberParams: Joi.object({ id: Joi.string().uuid().required(), memberId: Joi.string().uuid().required() }),

  create: Joi.object({
    ...poolFields,
    programId: Joi.string().uuid().required().messages({ 'any.required': 'Choose a programme' }),
    name: poolFields.name.required().messages({ 'any.required': 'Name the pool' }),
    selectionQuota: poolFields.selectionQuota.required().messages({ 'any.required': 'Say how many to select' })
  }),

  update: Joi.object(poolFields).min(1),

  status: Joi.object({
    status: Joi.string().valid('draft', 'open', 'qualifying', 'reviewing', 'closed').required()
  }),

  importApplications: Joi.object({
    statuses: Joi.array().items(Joi.string().valid('under_review', 'assessment_sent', 'accepted', 'waitlisted')).min(1).default(['accepted'])
  }),

  decision: Joi.object({
    decision: Joi.string().valid('selected', 'waitlisted', 'not_selected').required(),
    reason: Joi.string().trim().min(1).max(2000).required().messages({ 'any.required': 'Give a reason' })
  }),

  importMembers: Joi.object({
    emails: Joi.array().items(Joi.string().trim().max(255)).min(1).max(2000).required()
  }),

  removeMember: Joi.object({
    decision: Joi.string().valid('withdrawn', 'disqualified').required(),
    reason: Joi.string().trim().min(1).max(2000).required().messages({ 'any.required': 'Give a reason' })
  }),

  assignWork: Joi.object({
    componentKey: Joi.string().trim().max(40).required().messages({ 'any.required': 'Choose what this work counts toward' }),
    type: Joi.string().required(),
    title: Joi.string().trim().max(255).allow('', null),
    description: Joi.string().allow('', null),
    deliverable: Joi.string().allow('', null),
    difficulty: Joi.string().valid('easy', 'medium', 'hard', 'expert'),
    acceptanceCriteria: Joi.array().items(Joi.string().trim().max(500)).max(30),
    dueDate: Joi.string().isoDate().allow(null, ''),
    memberIds: Joi.array().items(Joi.string().uuid()).max(5000),
    quiz: Joi.object({ kitId: Joi.string().uuid().required() }).unknown(true),
    interview: Joi.object({ kitId: Joi.string().uuid().required() }).unknown(true),
    course: Joi.object({ courseId: Joi.string().trim().required() })
  }),

  finalize: Joi.object({
    overrides: Joi.array().items(Joi.object({
      memberId: Joi.string().uuid().required(),
      decision: Joi.string().valid('selected', 'waitlisted', 'not_selected').required(),
      reason: Joi.string().trim().max(2000).allow('')
    })).max(5000).default([])
  }),

  place: Joi.object({
    placements: Joi.array().items(Joi.object({
      memberId: Joi.string().uuid().required(),
      clanId: Joi.string().uuid().required()
    })).min(1).max(1000).required()
  })
};
