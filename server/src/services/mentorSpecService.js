const { models } = require('../db');

const CATEGORY = 'mentor_spec';

/** Default org mentor handbook - seeded until an admin edits it. */
const DEFAULT_SPEC = {
  intro: 'How we mentor at Pathment - the principles, the responsibilities, the bar.',
  principles: [
    { title: 'Guide, don’t gatekeep', body: 'Point the way and let mentees own the journey. Your read informs, it never decides for them.' },
    { title: 'Measure fairly', body: 'Judge progress against each person’s real constraints - accepted friction counts in their favour.' },
    { title: 'Be consistent', body: 'Reliable, timely feedback beats occasional brilliance. Small steady touches keep momentum.' },
    { title: 'Make work concrete', body: 'Clear deliverables and acceptance criteria. Vague asks create vague results.' },
    { title: 'Respect their time', body: 'Keep reviews fast and low-friction. Fast in, fast out - for them and for you.' },
    { title: 'Close the loop', body: 'Every submission gets a decision and a reason. Silence is the worst feedback.' }
  ],
  responsibilities: [
    'Review submissions promptly with a clear decision and a useful note.',
    'Keep an eye on your cohort’s at-risk signals and reach out early.',
    'Accept genuine friction so progress is measured fairly.',
    'Run regular 1:1s and capture what matters in notes.',
    'Nominate mentees who are ready to grow into co-mentors.'
  ],
  conduct: [
    'Treat every mentee with respect and patience.',
    'Keep personal information shared in 1:1s confidential.',
    'Give feedback on the work, not the person.',
    'Flag conflicts of interest to an admin.',
    'No discrimination, harassment, or favouritism - ever.'
  ],
  time: [
    { value: '~3h', label: 'per week, typical' },
    { value: '24h', label: 'target review turnaround' },
    { value: '1×', label: 'weekly 1:1 per mentee' }
  ],
  faqs: [
    { q: 'How fast should I review submissions?', a: 'Aim for within 24 hours. The Approvals queue surfaces what’s waiting and lets you bulk-approve on-time work.' },
    { q: 'What does “measured fairly” mean?', a: 'A mentee can log real constraints. When you accept a delay, it lifts their relative progress so they aren’t punished for things outside their control.' },
    { q: 'When should I escalate someone as at-risk?', a: 'Nudge early; escalate to an admin if someone goes silent for over a week.' },
    { q: 'How do roadmaps work?', a: 'Build (or import) an ordered set of steps and assign it. Approving a step automatically assigns the next one.' },
    { q: 'Can a mentee become a co-mentor?', a: 'Yes - nominate them in Promotions. After an interview and approval, an admin finalises the promotion.' }
  ]
};

/** Mentor handbook - one admin-authored org document, read by all mentors. */
class MentorSpecService {
  async _row() {
    return models.OrgPolicy.findOne({ where: { category: CATEGORY } });
  }

  async get() {
    const row = await this._row();
    if (!row) return DEFAULT_SPEC;
    try {
      const parsed = JSON.parse(row.body);
      return { ...DEFAULT_SPEC, ...parsed };
    } catch {
      return DEFAULT_SPEC;
    }
  }

  async save(spec, adminId) {
    const clean = {
      intro: typeof spec.intro === 'string' ? spec.intro : DEFAULT_SPEC.intro,
      principles: Array.isArray(spec.principles) ? spec.principles.filter((p) => p && p.title) : [],
      responsibilities: Array.isArray(spec.responsibilities) ? spec.responsibilities.filter(Boolean) : [],
      conduct: Array.isArray(spec.conduct) ? spec.conduct.filter(Boolean) : [],
      time: Array.isArray(spec.time) ? spec.time.filter((t) => t && t.value) : [],
      faqs: Array.isArray(spec.faqs) ? spec.faqs.filter((f) => f && f.q) : []
    };
    const body = JSON.stringify(clean);
    const row = await this._row();
    if (row) {
      row.body = body;
      await row.save();
    } else {
      await models.OrgPolicy.create({ title: 'Mentor Spec', category: CATEGORY, body, createdBy: adminId });
    }
    return clean;
  }
}

module.exports = new MentorSpecService();
