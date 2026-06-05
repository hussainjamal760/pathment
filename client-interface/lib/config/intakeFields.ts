/**
 * Application form field model, shared by the admin builder and the public apply
 * page. Two kinds of fields:
 *   - PROFILE fields use a catalog `key` that the server maps straight onto the
 *     User / MenteeProfile at registration (so the mentee never re-enters it).
 *     Keep these keys in sync with server/src/config/intakeProfileFields.js.
 *   - CUSTOM questions use a `q_`-prefixed key and just live in `responses` for
 *     triage — they never collide with a profile key.
 */

export type IntakeFieldType =
  | 'text' | 'textarea' | 'select' | 'checkboxes' | 'number' | 'date' | 'yes_no';

export interface IntakeFormField {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: string[];
  /** Present on profile-mapped fields; the catalog key that carries to the profile. */
  profileKey?: string;
}

/** Profile fields an admin can drop into the form (carry forward to the profile). */
export const PROFILE_FIELD_CATALOG: { key: string; label: string; type: IntakeFieldType; options?: string[] }[] = [
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'country', label: 'Country', type: 'text' },
  { key: 'currentEducation', label: 'Current education', type: 'text' },
  { key: 'currentOccupation', label: 'Current occupation', type: 'text' },
  { key: 'priorExperience', label: 'Prior experience', type: 'textarea' },
  { key: 'learningGoals', label: 'Learning goals', type: 'textarea' },
  { key: 'interests', label: 'Interests', type: 'textarea' },
  { key: 'preferredLearningStyle', label: 'Preferred learning style', type: 'select', options: ['visual', 'auditory', 'reading', 'kinesthetic'] },
  { key: 'linkedinUrl', label: 'LinkedIn URL', type: 'text' },
  { key: 'githubUrl', label: 'GitHub URL', type: 'text' },
  { key: 'portfolioUrl', label: 'Portfolio URL', type: 'text' },
];

export const CUSTOM_FIELD_TYPES: { type: IntakeFieldType; label: string }[] = [
  { type: 'text', label: 'Short text' },
  { type: 'textarea', label: 'Paragraph' },
  { type: 'select', label: 'Dropdown' },
  { type: 'checkboxes', label: 'Checkboxes' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'yes_no', label: 'Yes / No' },
];

const PROFILE_KEYS = new Set(PROFILE_FIELD_CATALOG.map((f) => f.key));
export const isProfileField = (key: string) => PROFILE_KEYS.has(key);

/** Slugify a label into a stable, collision-safe custom key (`q_<slug>`). */
export function customKeyFromLabel(label: string, existing: string[] = []): string {
  const base = 'q_' + (label || 'question')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'q_question';
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}
