/**
 * Catalog of "profile" fields an admin can add to a cohort's application form.
 * Each is tagged with a `key` (the stable field key stored in the application's
 * `responses`) and where it maps on registration so the mentee NEVER re-enters
 * it during onboarding — collect once at apply, reuse everywhere.
 *
 * `target`: 'user' | 'menteeProfile' — which record the answer lands on.
 * `field`:  the column on that record.
 * `array`:  true → the answer is split into a string[] (comma/newline separated).
 *
 * The client form builder imports the same catalog (lib/config/intakeFields.ts);
 * keep the two in sync.
 */
const INTAKE_PROFILE_FIELDS = [
  { key: 'firstName', label: 'First name', type: 'text', target: 'user', field: 'firstName' },
  { key: 'lastName', label: 'Last name', type: 'text', target: 'user', field: 'lastName' },
  { key: 'phone', label: 'Phone', type: 'text', target: 'user', field: 'phone' },
  { key: 'city', label: 'City', type: 'text', target: 'user', field: 'city' },
  { key: 'country', label: 'Country', type: 'text', target: 'user', field: 'country' },
  { key: 'currentEducation', label: 'Current education', type: 'text', target: 'menteeProfile', field: 'currentEducation' },
  { key: 'currentOccupation', label: 'Current occupation', type: 'text', target: 'menteeProfile', field: 'currentOccupation' },
  { key: 'priorExperience', label: 'Prior experience', type: 'textarea', target: 'menteeProfile', field: 'priorExperience' },
  { key: 'learningGoals', label: 'Learning goals', type: 'textarea', target: 'menteeProfile', field: 'learningGoals', array: true },
  { key: 'interests', label: 'Interests', type: 'textarea', target: 'menteeProfile', field: 'interests', array: true },
  { key: 'preferredLearningStyle', label: 'Preferred learning style', type: 'select', target: 'menteeProfile', field: 'preferredLearningStyle', options: ['visual', 'auditory', 'reading', 'kinesthetic'] },
  { key: 'linkedinUrl', label: 'LinkedIn URL', type: 'text', target: 'menteeProfile', field: 'linkedinUrl' },
  { key: 'githubUrl', label: 'GitHub URL', type: 'text', target: 'menteeProfile', field: 'githubUrl' },
  { key: 'portfolioUrl', label: 'Portfolio URL', type: 'text', target: 'menteeProfile', field: 'portfolioUrl' }
];

const BY_KEY = INTAKE_PROFILE_FIELDS.reduce((acc, f) => { acc[f.key] = f; return acc; }, {});

/**
 * Given an application's stored answers, split them into the user-record patch
 * and the mentee-profile patch (only for keys present in the catalog + answered).
 */
function mapResponsesToProfile(responses = {}) {
  const userPatch = {};
  const profilePatch = {};
  for (const [key, raw] of Object.entries(responses || {})) {
    const def = BY_KEY[key];
    if (!def || raw == null || String(raw).trim() === '') continue;
    const value = def.array
      ? String(raw).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      : String(raw).trim();
    if (def.target === 'user') userPatch[def.field] = value;
    else profilePatch[def.field] = value;
  }
  return { userPatch, profilePatch };
}

module.exports = { INTAKE_PROFILE_FIELDS, BY_KEY, mapResponsesToProfile };
