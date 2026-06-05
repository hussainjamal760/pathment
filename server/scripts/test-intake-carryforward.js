/* Synthetic test for intake carry-forward (application → profile on register)
 * and clone-intake. Self-cleaning. Run: node scripts/test-intake-carryforward.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Op } = require('sequelize');
const { models, sequelize } = require('../src/db');
const authService = require('../src/services/authService');
const cohortIntakeService = require('../src/services/cohortIntakeService');
const { generateRandomToken, hashToken } = require('../src/utils/jwt');

const TAG = `carryfwd_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], cohorts: [], applications: [], invites: [] };

(async () => {
  try {
    const admin = await models.User.create({
      email: e('admin'), passwordHash: 'x', role: 'admin', firstName: 'A', lastName: 'D', emailVerified: true, status: 'active'
    });
    created.users.push(admin.id);

    const program = await models.Program.create({
      createdBy: admin.id, name: `${TAG}Prog`, description: 'd', type: 'mentorship',
      status: 'published', visibility: 'public', totalDurationWeeks: 10, estimatedHoursPerWeek: 5
    });
    created.programs.push(program.id);

    const cohort = await cohortIntakeService.createCohort({ programId: program.id, name: 'Intake A', status: 'open' }, admin.id);
    created.cohorts.push(cohort.id);

    // ── carry-forward: applicant answers → profile on register ────────────────
    const applicantEmail = e('applicant');
    const rawToken = generateRandomToken();
    const invite = await models.RegistrationInvite.create({
      tokenHash: hashToken(rawToken),
      email: applicantEmail,
      role: 'mentee',
      invitedBy: admin.id,
      programId: program.id,
      cohortId: cohort.id,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    });
    created.invites.push(invite.id);

    const application = await models.Application.create({
      cohortId: cohort.id,
      email: applicantEmail,
      firstName: 'Grace',
      lastName: 'Hopper',
      source: 'public_link',
      inviteId: invite.id,
      responses: {
        currentEducation: 'BSc Computer Science',
        interests: 'ai, distributed systems',
        githubUrl: 'https://github.com/grace',
        q_why: 'I love compilers'   // custom question — must NOT map to profile
      }
    });
    created.applications.push(application.id);

    // Register with empty name → should fall back to the application's name.
    const { user } = await authService.register({
      firstName: '', lastName: '', email: applicantEmail,
      password: 'SecurePass123!', confirmPassword: 'SecurePass123!', inviteToken: rawToken
    });
    created.users.push(user.id);

    ok(user.firstName === 'Grace' && user.lastName === 'Hopper', 'name carried from application when register sent none');
    ok(user.onboardingStep === 1, 'onboarding profile step auto-completed (onboardingStep=1)');

    const profile = await models.MenteeProfile.findOne({ where: { userId: user.id } });
    ok(profile.currentEducation === 'BSc Computer Science', 'education carried onto mentee profile');
    ok(Array.isArray(profile.interests) && profile.interests.includes('ai') && profile.interests.includes('distributed systems'), 'interests carried + split into array');
    ok(profile.githubUrl === 'https://github.com/grace', 'github url carried onto profile');

    // Enrollment created from invite placement.
    const enrollment = await models.Enrollment.findOne({ where: { menteeId: user.id, programId: program.id } });
    ok(!!enrollment, 'enrollment created from invite');

    // ── clone-intake: copy form + assessment config to a new cohort ───────────
    await cohort.update({
      intakeFormSchema: [{ key: 'currentEducation', label: 'Education', type: 'text', profileKey: 'currentEducation' }],
      assessmentRequired: true
    });
    const cohortB = await cohortIntakeService.createCohort({ programId: program.id, name: 'Intake B', status: 'planning' }, admin.id);
    created.cohorts.push(cohortB.id);

    const cloned = await cohortIntakeService.cloneIntakeFrom(cohortB.id, cohort.id);
    ok(Array.isArray(cloned.intakeFormSchema) && cloned.intakeFormSchema.length === 1 && cloned.intakeFormSchema[0].key === 'currentEducation', 'clone copied the application form schema');
    ok(cloned.assessmentRequired === true, 'clone copied the assessment-required flag');

    // Cloning from itself is rejected.
    let selfBlocked = false;
    try { await cohortIntakeService.cloneIntakeFrom(cohortB.id, cohortB.id); } catch { selfBlocked = true; }
    ok(selfBlocked, 'cloning a cohort from itself is rejected');

  } catch (err) {
    fail++;
    console.error('  ✗ threw:', err.message);
    console.error(err.stack);
  } finally {
    try {
      if (created.users.length) {
        await models.Enrollment.destroy({ where: { menteeId: { [Op.in]: created.users } } });
        await models.MenteeProfile.destroy({ where: { userId: { [Op.in]: created.users } } });
        await models.MentorProfile.destroy({ where: { userId: { [Op.in]: created.users } } });
        await models.UserSettings.destroy({ where: { userId: { [Op.in]: created.users } } });
        await models.ClanMembership.destroy({ where: { userId: { [Op.in]: created.users } } });
      }
      if (created.applications.length) await models.Application.destroy({ where: { id: { [Op.in]: created.applications } } });
      if (created.invites.length) await models.RegistrationInvite.destroy({ where: { id: { [Op.in]: created.invites } } });
      if (created.cohorts.length) await models.Cohort.destroy({ where: { id: { [Op.in]: created.cohorts } } });
      if (created.programs.length) await models.Program.destroy({ where: { id: { [Op.in]: created.programs } }, force: true });
      if (created.users.length) await models.User.destroy({ where: { id: { [Op.in]: created.users } }, force: true });
    } catch (cleanupErr) {
      console.error('  cleanup warning:', cleanupErr.message);
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
