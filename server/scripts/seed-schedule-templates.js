/**
 * Seed org-level schedule templates so the admin/mentor Schedules page isn't empty.
 * A template is a PURE day-shape (named time blocks, no tasks). Idempotent: skips
 * any org template whose name already exists. Safe to re-run.
 *
 * Run: node scripts/seed-schedule-templates.js
 */
const path = require('path');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');

// block = { id, label, time (24h "HH:MM"), days, bookable }
const block = (label, time, days, bookable = false) => ({ id: randomUUID(), label, time, days, bookable });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ALL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKEND = ['Sat', 'Sun'];

const TEMPLATES = [
  {
    name: 'Full-time Intensive',
    description: 'For learners studying full-time. Daily standup, deep-work blocks, and an end-of-day reflection.',
    blocks: [
      block('Morning standup', '09:00', WEEKDAYS, true),
      block('Deep work - build', '09:30', WEEKDAYS),
      block('Lunch', '13:00', WEEKDAYS),
      block('Deep work - build', '14:00', WEEKDAYS),
      block('Mentor office hours', '16:30', WEEKDAYS, true),
      block('End-of-day reflection', '17:30', WEEKDAYS),
    ],
  },
  {
    name: 'Working Professional (evenings)',
    description: 'For mentees with a day job. Light morning check-in, focused evening work, and a weekend catch-up.',
    blocks: [
      block('Morning check-in', '08:00', WEEKDAYS),
      block('Evening focus block', '19:00', WEEKDAYS),
      block('Mentor 1:1 (book a slot)', '20:30', ['Tue', 'Thu'], true),
      block('Weekend catch-up', '11:00', WEEKEND),
    ],
  },
  {
    name: 'Weekend Cohort',
    description: 'Weekend-heavy shape for part-time learners. Long Saturday/Sunday build blocks plus a midweek nudge.',
    blocks: [
      block('Midweek check-in', '19:30', ['Wed'], true),
      block('Saturday build', '10:00', ['Sat']),
      block('Saturday review & 1:1', '15:00', ['Sat'], true),
      block('Sunday build', '10:00', ['Sun']),
      block('Week planning', '17:00', ['Sun']),
    ],
  },
  {
    name: 'Balanced Daily',
    description: 'A gentle every-day rhythm: a morning intention, a core work block, and an evening wrap-up.',
    blocks: [
      block('Morning intention', '08:30', ALL),
      block('Core work', '10:00', ALL),
      block('Evening wrap-up', '19:00', ALL),
    ],
  },
];

(async () => {
  let created = 0, skipped = 0;
  try {
    // createdBy is nullable; attribute to an admin if one exists.
    const admin = await models.User.findOne({ where: { role: 'admin', status: 'active' }, attributes: ['id'] });
    for (const t of TEMPLATES) {
      const exists = await models.ScheduleTemplate.findOne({ where: { source: 'org', name: t.name } });
      if (exists) { skipped++; console.log(`  ℹ skip (exists): ${t.name}`); continue; }
      await models.ScheduleTemplate.create({
        name: t.name,
        description: t.description,
        source: 'org',
        ownerMentorId: null,
        blocks: t.blocks,
        createdBy: admin ? admin.id : null,
      });
      created++; console.log(`  ✓ created: ${t.name} (${t.blocks.length} blocks)`);
    }
    console.log(`\n✅ Schedule templates seeded: ${created} created, ${skipped} skipped`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Seeding failed:', e.message);
    process.exit(1);
  }
})();
