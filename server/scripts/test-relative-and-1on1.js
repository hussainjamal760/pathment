/* Enhanced relative grading (job/study load + delays + blockers) and the richer
 * 1:1 logger (personality read + working-style + blockers flow to the profile).
 * Self-cleaning. Run: node scripts/test-relative-and-1on1.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const cohort = require('../src/services/cohortService');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const TAG = `rel_${Date.now()}_`;
const created = { users: [], profiles: [], notes: [] };

(async () => {
  try {
    // ── Relative grading formula ──────────────────────────────────────────
    const base = { delays: [], occupation: null, openBlockers: 0 };
    ok(cohort.computeRelativeProgress(50, base) === 50, 'no constraints → relative == absolute');
    ok(cohort.computeRelativeProgress(50, { ...base, occupation: 'Software Engineer' }) === 59, 'employed → +9 job-load credit');
    ok(cohort.computeRelativeProgress(50, { ...base, occupation: 'CS Student' }) === 55, 'full-time study → +5 credit');
    ok(cohort.computeRelativeProgress(50, { ...base, delays: [{ accepted: true, category: 'external', days: 4 }] }) === 56, 'accepted external delay → +6');
    ok(cohort.computeRelativeProgress(50, { ...base, openBlockers: 2 }) === 54, 'open blockers → +4');
    // Combined, capped at +30 total
    const combined = cohort.computeRelativeProgress(50, { occupation: 'Engineer', openBlockers: 5, delays: [{ accepted: true, category: 'external', days: 20 }] });
    ok(combined === 80, 'combined credit caps at +30 (50 → 80)');
    ok(cohort.computeRelativeProgress(95, { ...base, occupation: 'Engineer' }) === 100, 'never exceeds 100');
    ok(cohort.computeRelativeProgress(40, { ...base, delays: [{ accepted: false, category: 'external', days: 10 }] }) === 40, 'UN-accepted delay gives no credit');

    // ── Richer 1:1 logger persistence + profile flow ──────────────────────
    const mentor = await models.User.create({ email: `${TAG}m@x.io`, passwordHash: 'x', role: 'mentor', capabilities: ['mentor'], firstName: 'M', lastName: 'T', emailVerified: true, status: 'active' });
    const mentee = await models.User.create({ email: `${TAG}e@x.io`, passwordHash: 'x', role: 'mentee', capabilities: ['mentee'], firstName: 'E', lastName: 'T', emailVerified: true, status: 'active' });
    created.users.push(mentor.id, mentee.id);
    const profile = await models.MenteeProfile.create({ userId: mentee.id });
    created.profiles.push(profile.id);

    const note = await cohort.logMeetingNote(mentee.id, {
      summary: 'Good chat about JWT auth.',
      sentiment: 'positive',
      personalityRead: 'Prefers async written feedback; discouraged by vague asks.',
      workingStyle: { consistency: 85, communication: 78, resilience: 92, independence: 70, bogus: 999 },
      blockers: ['JWT refresh edge case', ''],
      issues: ['scope creep'],
      nextSteps: ['pair on tests'],
      attributedTo: 'Dr. Specialist',
      attributedToId: null,
    }, mentor.id);
    created.notes.push(note.id);

    const saved = await models.MeetingNote.findByPk(note.id);
    ok(saved.personalityRead?.startsWith('Prefers async'), '1:1 stores personality read');
    ok(saved.workingStyle?.consistency === 85 && saved.workingStyle?.resilience === 92, '1:1 stores working-style axes');
    ok(saved.workingStyle?.bogus === undefined, 'unknown working-style keys are sanitized out');
    ok(Array.isArray(saved.blockers) && saved.blockers.length === 1, 'blockers list stored on the note (empty lines dropped)');
    ok(saved.attributedTo === 'Dr. Specialist', '1:1 stores "logged by" attribution');
    ok(saved.createdBy === mentor.id, 'createdBy still records the real logger');

    // Blockers became REAL open blocker records.
    const realBlockers = await models.Blocker.findAll({ where: { menteeId: mentee.id, status: 'open' } });
    ok(realBlockers.length === 1 && /JWT refresh/.test(realBlockers[0].title), 'blockers to track became real open Blocker records');

    // Attribution defaults to the mentor when not provided.
    const note2 = await cohort.logMeetingNote(mentee.id, { summary: 'quick sync' }, mentor.id);
    created.notes.push(note2.id);
    const saved2 = await models.MeetingNote.findByPk(note2.id);
    ok(saved2.attributedTo === 'M T', 'attribution defaults to the logging mentor');

    const refreshed = await models.MenteeProfile.findByPk(profile.id);
    ok(refreshed.personality?.read?.startsWith('Prefers async'), 'personality read flows onto the mentee profile');
    ok(refreshed.personality?.consistency === 85 && refreshed.personality?.resilience === 92, 'working-style dims surface at top level (Working-style card reads these)');

    console.log(`\n${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err);
    fail++;
  } finally {
    for (const id of created.notes) await models.MeetingNote.destroy({ where: { id } });
    for (const id of created.users) await models.Blocker.destroy({ where: { menteeId: id } });
    for (const id of created.profiles) await models.MenteeProfile.destroy({ where: { id } });
    for (const id of created.users) await models.User.destroy({ where: { id } });
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
