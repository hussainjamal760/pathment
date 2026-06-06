/* Lead mentor: list unassigned ("leftover") mentees, add them, and invite a new
 * one straight into the clan. Self-cleaning. Run: node scripts/test-clan-add-invite.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const clanService = require('../src/services/clanService');

const TAG = `cai_${Date.now()}_`;
const e = (s) => (TAG + s + '@x.io').toLowerCase().replace(/\s+/g, '');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [], programs: [], clans: [], memberships: [], invites: [] };

const mkUser = async (first, role) => {
  const u = await models.User.create({ email: e(first), passwordHash: 'x', role, capabilities: [role], firstName: first, lastName: 'T', emailVerified: true, status: 'active' });
  created.users.push(u.id);
  return u;
};

(async () => {
  try {
    const admin = await mkUser('admin', 'admin');
    const lead = await mkUser('lead', 'mentor');
    const free = await mkUser('Free Mentee', 'mentee');     // unassigned
    const taken = await mkUser('Taken Mentee', 'mentee');   // already in a clan

    const prog = await models.Program.create({ createdBy: admin.id, name: `${TAG}P`, description: 'd', type: 'mentorship', status: 'published', visibility: 'private', totalDurationWeeks: 8, estimatedHoursPerWeek: 4 });
    created.programs.push(prog.id);
    const clan = await models.Clan.create({ programId: prog.id, name: `${TAG}Clan`, createdBy: admin.id, leadMentorId: lead.id });
    const otherClan = await models.Clan.create({ programId: prog.id, name: `${TAG}Other`, createdBy: admin.id });
    created.clans.push(clan.id, otherClan.id);
    const m1 = await models.ClanMembership.create({ clanId: clan.id, userId: lead.id, role: 'lead_mentor', status: 'active' });
    const m2 = await models.ClanMembership.create({ clanId: otherClan.id, userId: taken.id, role: 'mentee', status: 'active' });
    created.memberships.push(m1.id, m2.id);

    // Available list: includes the unassigned mentee, excludes the one in another clan.
    const avail = await clanService.listAvailableMembers();
    const ids = avail.map((p) => p.id);
    ok(ids.includes(free.id), 'unassigned mentee appears in available list');
    ok(!ids.includes(taken.id), 'mentee already in a clan is excluded');
    ok(!ids.includes(lead.id), 'mentors are not listed as available mentees');

    // Search filters.
    const search = await clanService.listAvailableMembers({ q: 'Free' });
    ok(search.some((p) => p.id === free.id) && !search.some((p) => p.id === taken.id), 'search filters available people');

    // Add the leftover mentee to the lead's clan → enrollment + membership created, no longer available.
    await clanService.addMember(clan.id, { userId: free.id, role: 'mentee' });
    const membership = await models.ClanMembership.findOne({ where: { clanId: clan.id, userId: free.id, status: 'active' } });
    ok(Boolean(membership), 'leftover mentee is now an active member of the clan');
    const availAfter = await clanService.listAvailableMembers();
    ok(!availAfter.map((p) => p.id).includes(free.id), 'added mentee drops off the available list');

    // Invite a brand-new person straight into the clan.
    const invite = await clanService.inviteToClan(clan.id, e('newbie'), lead.id);
    created.invites.push(invite.id);
    const row = await models.RegistrationInvite.findByPk(invite.id);
    ok(row && row.role === 'mentee', 'invite created with role mentee');
    ok(row.clanId === clan.id && row.programId === prog.id, 'invite is scoped to the clan + its program');

    console.log(`\n${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err);
    fail++;
  } finally {
    for (const id of created.users) await models.Notification.destroy({ where: { userId: id } });
    for (const id of created.invites) await models.AuditLog.destroy({ where: { entityId: id } });
    for (const id of created.invites) await models.RegistrationInvite.destroy({ where: { id } });
    for (const id of created.users) await models.Enrollment.destroy({ where: { menteeId: id } });
    await models.ClanMembership.destroy({ where: { clanId: created.clans } });
    for (const id of created.clans) await models.Clan.destroy({ where: { id } });
    for (const id of created.programs) await models.Program.destroy({ where: { id } });
    for (const id of created.users) await models.User.destroy({ where: { id } });
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
