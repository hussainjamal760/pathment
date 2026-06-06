/* Cohort-review attendance persists (upsert per mentor+mentee+day) and reads back.
 * Self-cleaning. Run: node scripts/test-review-attendance.js */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const cohort = require('../src/services/cohortService');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const TAG = `att_${Date.now()}_`;
const ids = [];

(async () => {
  try {
    const mentor = await models.User.create({ email: `${TAG}m@x.io`, passwordHash: 'x', role: 'mentor', capabilities: ['mentor'], firstName: 'M', lastName: 'T', emailVerified: true, status: 'active' });
    const a = await models.User.create({ email: `${TAG}a@x.io`, passwordHash: 'x', role: 'mentee', capabilities: ['mentee'], firstName: 'A', lastName: 'T', emailVerified: true, status: 'active' });
    const b = await models.User.create({ email: `${TAG}b@x.io`, passwordHash: 'x', role: 'mentee', capabilities: ['mentee'], firstName: 'B', lastName: 'T', emailVerified: true, status: 'active' });
    ids.push(mentor.id, a.id, b.id);

    await cohort.setAttendance(a.id, mentor.id, 'present');
    await cohort.setAttendance(b.id, mentor.id, 'absent');
    let map = await cohort.getTodayAttendance(mentor.id);
    ok(map[a.id] === 'present' && map[b.id] === 'absent', 'attendance persists + reads back');

    // Re-mark = upsert (no duplicate row, value updates).
    await cohort.setAttendance(a.id, mentor.id, 'excused');
    map = await cohort.getTodayAttendance(mentor.id);
    ok(map[a.id] === 'excused', 're-marking updates the same record');
    const rows = await models.MeetingNote.count({ where: { mentorId: mentor.id, menteeId: a.id, kind: 'review' } });
    ok(rows === 1, 'no duplicate review note per mentee per day (upsert)');

    // Invalid status rejected.
    let rejected = false;
    try { await cohort.setAttendance(a.id, mentor.id, 'bogus'); } catch { rejected = true; }
    ok(rejected, 'invalid attendance status is rejected');

    console.log(`\n${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err);
    fail++;
  } finally {
    for (const id of ids) await models.MeetingNote.destroy({ where: { mentorId: id } });
    for (const id of ids) await models.User.destroy({ where: { id } });
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
