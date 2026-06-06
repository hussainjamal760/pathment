/**
 * Demo seeder — a single, self-contained, demo-ready dataset for client demos.
 *
 * Creates one fully-populated program with everything the admin, mentor and
 * mentee experiences need to look real:
 *   • 1 admin, 2 lead mentors, 8 mentees (all log in with the same demo password)
 *   • 1 published program + running cohort + 2 clans
 *   • 1 org roadmap with 6 ordered tasks
 *   • per-mentee enrollments + assigned tasks crafted to span the FULL risk
 *     spectrum (on-track, star, disengaged/at-risk, struggling-but-fighting,
 *     on-watch, awaiting-review, brand-new) so the mentor cockpit, at-risk page
 *     and review flow all show legitimate, varied data
 *   • blockers, accepted delays, meeting notes, filled schedules, announcements
 *
 * Idempotent: it always wipes and recreates the demo namespace (everything
 * scoped to @demo.pathment.com users + the demo program), so re-running gives
 * a clean, consistent dataset. It never touches real data.
 *
 * Run with:  npm run seed:demo
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const bcrypt = require("bcrypt");
const { sequelize, models } = require("../src/db");
const { Op } = require("sequelize");

const DEMO_DOMAIN = "@demo.pathment.com";
const DEMO_PASSWORD = "Demo@1234";
const PROGRAM_NAME = "Full-Stack Engineering Fellowship (Demo)";

// Date helpers — everything is relative to "now" so the demo always looks fresh.
const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysAhead = (n) => new Date(Date.now() + n * DAY);

async function cleanupDemo() {
  console.log("🧹 Clearing any existing demo namespace…");
  const demoUsers = await models.User.findAll({
    where: { email: { [Op.like]: `%${DEMO_DOMAIN}` } },
    attributes: ["id"],
  });
  const userIds = demoUsers.map((u) => u.id);
  const program = await models.Program.findOne({ where: { name: PROGRAM_NAME } });

  // Child rows first (FK order). Scope strictly to demo users / demo program.
  if (userIds.length) {
    const byMentee = { where: { menteeId: { [Op.in]: userIds } } };
    await models.MeetingNote.destroy({ where: { menteeId: { [Op.in]: userIds } } });
    await models.MenteeSchedule.destroy(byMentee);
    await models.Blocker.destroy(byMentee);
    await models.DelayEvent.destroy(byMentee);
    await models.AssignedTask.destroy(byMentee);
    await models.Enrollment.destroy(byMentee);
    await models.ClanMembership.destroy({ where: { userId: { [Op.in]: userIds } } });
    await models.Announcement.destroy({ where: { authorId: { [Op.in]: userIds } } });
  }
  if (program) {
    const roadmaps = await models.Roadmap.findAll({ where: { programId: program.id }, attributes: ["id"] });
    const rmIds = roadmaps.map((r) => r.id);
    if (rmIds.length) await models.RoadmapTask.destroy({ where: { roadmapId: { [Op.in]: rmIds } } });
    await models.Roadmap.destroy({ where: { programId: program.id } });
    await models.Clan.destroy({ where: { programId: program.id } });
    await models.Cohort.destroy({ where: { programId: program.id } });
    await models.Program.destroy({ where: { id: program.id } });
  }
  if (userIds.length) {
    await models.MenteeProfile.destroy({ where: { userId: { [Op.in]: userIds } } });
    await models.MentorProfile.destroy({ where: { userId: { [Op.in]: userIds } } });
    await models.AdminProfile.destroy({ where: { userId: { [Op.in]: userIds } } });
    await models.ScheduleTemplate.destroy({ where: { createdBy: { [Op.in]: userIds } } });
    await models.User.destroy({ where: { id: { [Op.in]: userIds } } });
  }
  console.log("✅ Demo namespace clear\n");
}

async function makeUser({ first, last, emailLocal, role, occupation, lastActivityDate, level }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await models.User.create({
    firstName: first,
    lastName: last,
    email: `${emailLocal}${DEMO_DOMAIN}`,
    passwordHash,
    role,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    profileCompleted: true,
    onboardingStep: 3,
  });

  if (role === "admin") {
    await models.AdminProfile.create({
      userId: user.id,
      permissions: ["all"],
      canManageUsers: true,
      canManagePrograms: true,
      canManageContent: true,
      canViewAnalytics: true,
      canManageSettings: true,
    });
  } else if (role === "mentor") {
    await models.MentorProfile.create({
      userId: user.id,
      yearsOfExperience: 7,
      maxMentees: 15,
      isAcceptingMentees: true,
    });
  } else {
    await models.MenteeProfile.create({
      userId: user.id,
      currentOccupation: occupation || null,
      lastActivityDate: lastActivityDate || null,
      currentLevel: level || 1,
    });
  }
  return user;
}

async function seed() {
  console.log("🔍 Connecting to database…");
  await sequelize.authenticate();
  console.log("✅ Database connected\n");

  await cleanupDemo();

  // ── People ────────────────────────────────────────────────────────────────
  console.log("👤 Creating users…");
  const admin = await makeUser({ first: "Dana", last: "Reyes", emailLocal: "admin", role: "admin" });
  const aisha = await makeUser({ first: "Aisha", last: "Khan", emailLocal: "mentor.aisha", role: "mentor" });
  const omar = await makeUser({ first: "Omar", last: "Farooq", emailLocal: "mentor.omar", role: "mentor" });

  // 8 mentee archetypes spanning the full risk spectrum.
  // occupation + lastActivityDate feed the risk/fairness math directly.
  const menteeSpecs = [
    { first: "Maya", last: "Patel", local: "mentee.maya", clan: "FE", archetype: "star", occupation: "Frontend Developer", active: 0 },
    { first: "Leo", last: "Nguyen", local: "mentee.leo", clan: "FE", archetype: "on_track", occupation: "CS Student", active: 1 },
    { first: "Sara", last: "Ali", local: "mentee.sara", clan: "FE", archetype: "disengaged", occupation: null, active: 14 },
    { first: "Tom", last: "Becker", local: "mentee.tom", clan: "FE", archetype: "new", occupation: null, active: null },
    { first: "Noor", last: "Hassan", local: "mentee.noor", clan: "BE", archetype: "fighting", occupation: "Junior Backend Engineer", active: 2 },
    { first: "Ivan", last: "Petrov", local: "mentee.ivan", clan: "BE", archetype: "watch", occupation: "University Student", active: 6 },
    { first: "Priya", last: "Sharma", local: "mentee.priya", clan: "BE", archetype: "review", occupation: "Bootcamp Grad", active: 1 },
    { first: "Jack", last: "Owusu", local: "mentee.jack", clan: "BE", archetype: "average", occupation: "Self-taught", active: 3 },
  ];

  const mentees = {};
  for (const s of menteeSpecs) {
    const u = await makeUser({
      first: s.first, last: s.last, emailLocal: s.local, role: "mentee",
      occupation: s.occupation, lastActivityDate: s.active == null ? null : daysAgo(s.active),
      level: 1,
    });
    mentees[s.local] = { user: u, spec: s };
  }
  console.log(`✅ ${2 + 8 + 1} users created (1 admin, 2 mentors, 8 mentees)\n`);

  // ── Program + cohort ────────────────────────────────────────────────────────
  console.log("📚 Creating program, cohort & clans…");
  const program = await models.Program.create({
    createdBy: admin.id,
    name: PROGRAM_NAME,
    description:
      "A 12-week, project-based fellowship taking engineers from fundamentals to a deployed full-stack application, with weekly mentor reviews and clan-based peer support.",
    type: "mentorship",
    status: "published",
    visibility: "private",
    totalDurationWeeks: 12,
    estimatedHoursPerWeek: 12,
    startDate: daysAgo(7 * 7), // started ~7 weeks ago
    endDate: daysAhead(5 * 7),
    currentEnrollments: 8,
  });

  const cohort = await models.Cohort.create({
    programId: program.id,
    name: "Spring 2026 Cohort",
    status: "running",
    startDate: daysAgo(7 * 7),
    endDate: daysAhead(5 * 7),
    createdBy: admin.id,
  });

  const feClan = await models.Clan.create({
    programId: program.id,
    name: "Frontend Clan",
    leadMentorId: aisha.id,
    maxMentees: 25,
    status: "active",
    healthStatus: "green",
    createdBy: admin.id,
  });
  const beClan = await models.Clan.create({
    programId: program.id,
    name: "Backend Clan",
    leadMentorId: omar.id,
    maxMentees: 25,
    status: "active",
    healthStatus: "amber",
    createdBy: admin.id,
  });

  // Lead-mentor memberships (this is how the mentor cockpit discovers its cohort).
  await models.ClanMembership.create({ clanId: feClan.id, userId: aisha.id, role: "lead_mentor", status: "active" });
  await models.ClanMembership.create({ clanId: beClan.id, userId: omar.id, role: "lead_mentor", status: "active" });
  console.log("✅ Program, cohort & 2 clans created\n");

  // ── Roadmap + tasks ──────────────────────────────────────────────────────────
  console.log("🗺️  Creating roadmap & tasks…");
  const roadmap = await models.Roadmap.create({
    programId: program.id,
    name: "Full-Stack Core Roadmap",
    description: "The shared backbone every fellow follows, week by week.",
    isBaseRoadmap: true,
    scope: "org",
    published: true,
    totalWeeks: 12,
    totalTasks: 6,
    skillTags: ["html", "css", "javascript", "react", "node", "postgres"],
  });

  const taskDefs = [
    { title: "Semantic HTML & accessible layout", type: "project", difficulty: "easy", week: 1, deliverable: "A responsive, accessible landing page." },
    { title: "Modern CSS & responsive design", type: "exercise", difficulty: "easy", week: 2, deliverable: "A mobile-first component library." },
    { title: "JavaScript fundamentals & DOM", type: "practical", difficulty: "medium", week: 3, deliverable: "An interactive to-do app, no frameworks." },
    { title: "React components & state", type: "project", difficulty: "medium", week: 5, deliverable: "A multi-view React dashboard." },
    { title: "REST APIs with Node & Express", type: "project", difficulty: "hard", week: 7, deliverable: "A CRUD API with auth." },
    { title: "Postgres data modeling", type: "assignment", difficulty: "hard", week: 9, deliverable: "A normalized schema + seeded queries." },
  ];
  const roadmapTasks = [];
  for (let i = 0; i < taskDefs.length; i++) {
    const d = taskDefs[i];
    roadmapTasks.push(
      await models.RoadmapTask.create({
        roadmapId: roadmap.id,
        title: d.title,
        description: `Week ${d.week}: ${d.title}. Build the deliverable, then submit for mentor review.`,
        type: d.type,
        difficulty: d.difficulty,
        taskOrder: i + 1,
        deliverable: d.deliverable,
        estimatedHours: 10,
        pointsBase: 10 + i * 2,
      })
    );
  }
  console.log(`✅ Roadmap + ${roadmapTasks.length} tasks created\n`);

  // ── Per-mentee enrollment + assigned tasks (the heart of the demo) ────────────
  console.log("🎯 Enrolling mentees & assigning work…");

  // archetype → how many roadmap tasks to assign and in what shape.
  // Returns a list of { idx, status, late, completedDaysAgo, dueDaysFromNow }.
  function planFor(archetype) {
    switch (archetype) {
      case "star": // 9th week, flying, recent completions → low risk, momentum up
        return {
          week: 9, progress: 82,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 50 },
            { idx: 1, status: "completed", completedDaysAgo: 40 },
            { idx: 2, status: "completed", completedDaysAgo: 28 },
            { idx: 3, status: "completed", completedDaysAgo: 5 },
            { idx: 4, status: "completed", completedDaysAgo: 2 },
            { idx: 5, status: "in_progress", dueDaysFromNow: 6 },
          ],
        };
      case "on_track": // steady, on pace → low
        return {
          week: 7, progress: 56,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 42 },
            { idx: 1, status: "completed", completedDaysAgo: 30 },
            { idx: 2, status: "completed", completedDaysAgo: 18 },
            { idx: 3, status: "completed", completedDaysAgo: 4 },
            { idx: 4, status: "in_progress", dueDaysFromNow: 5 },
          ],
        };
      case "disengaged": // has work, never touched it, silent 14 days → HIGH
        return {
          week: 7, progress: 8,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 38, late: true },
            { idx: 1, status: "assigned", dueDaysFromNow: -10 },
            { idx: 2, status: "assigned", dueDaysFromNow: -3 },
            { idx: 3, status: "assigned", dueDaysFromNow: 4 },
          ],
        };
      case "new": // just joined, no work assigned yet → LOW (the risk fix)
        return { week: 1, progress: 0, tasks: [] };
      case "fighting": // behind, but real logged friction (job + delays + blocker) → WATCH, softened
        return {
          week: 7, progress: 30,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 40 },
            { idx: 1, status: "completed", completedDaysAgo: 25, late: true },
            { idx: 2, status: "in_progress", dueDaysFromNow: 2 },
            { idx: 3, status: "assigned", dueDaysFromNow: 6 },
          ],
        };
      case "watch": // 1 blocker, quiet 6 days, stalled → WATCH
        return {
          week: 7, progress: 45,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 44 },
            { idx: 1, status: "completed", completedDaysAgo: 33 },
            { idx: 2, status: "completed", completedDaysAgo: 20 },
            { idx: 3, status: "in_progress", dueDaysFromNow: -2 },
          ],
        };
      case "review": // healthy but has submissions waiting on the mentor → LOW + pending
        return {
          week: 6, progress: 50,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 35 },
            { idx: 1, status: "completed", completedDaysAgo: 22 },
            { idx: 2, status: "submitted" },
            { idx: 3, status: "submitted" },
          ],
        };
      case "average": // unremarkable, on pace → LOW
      default:
        return {
          week: 5, progress: 40,
          tasks: [
            { idx: 0, status: "completed", completedDaysAgo: 30 },
            { idx: 1, status: "completed", completedDaysAgo: 16 },
            { idx: 2, status: "in_progress", dueDaysFromNow: 4 },
          ],
        };
    }
  }

  for (const s of menteeSpecs) {
    const m = mentees[s.local].user;
    const clan = s.clan === "FE" ? feClan : beClan;
    const mentor = s.clan === "FE" ? aisha : omar;
    const plan = planFor(s.archetype);

    const enrollment = await models.Enrollment.create({
      menteeId: m.id,
      programId: program.id,
      cohortId: cohort.id,
      status: "active",
      currentWeek: plan.week,
      tasksCompleted: plan.tasks.filter((t) => t.status === "completed").length,
      tasksTotal: plan.tasks.length,
      overallProgressPercentage: plan.progress,
      enrolledAt: daysAgo(7 * 7),
      startedAt: daysAgo(7 * 7),
      expectedCompletionDate: daysAhead(5 * 7),
      avgTaskRating: s.archetype === "star" ? 4.6 : s.archetype === "on_track" ? 4.1 : 3.6,
    });

    // Clan membership ties the mentee to the mentor's cohort.
    await models.ClanMembership.create({
      clanId: clan.id, userId: m.id, role: "mentee", status: "active", enrollmentId: enrollment.id,
    });

    for (const t of plan.tasks) {
      const rt = roadmapTasks[t.idx];
      const completedAt = t.status === "completed" && t.completedDaysAgo != null ? daysAgo(t.completedDaysAgo) : null;
      const dueDate = t.dueDaysFromNow != null ? daysAhead(t.dueDaysFromNow) : (completedAt ? daysAgo(t.completedDaysAgo + 5) : null);
      await models.AssignedTask.create({
        roadmapTaskId: rt.id,
        menteeId: m.id,
        mentorId: mentor.id,
        enrollmentId: enrollment.id,
        status: t.status,
        assignedAt: daysAgo(50),
        dueDate,
        startedAt: ["in_progress", "submitted", "completed"].includes(t.status) ? daysAgo(t.completedDaysAgo != null ? t.completedDaysAgo + 4 : 6) : null,
        submittedAt: ["submitted", "completed"].includes(t.status) ? (completedAt || daysAgo(1)) : null,
        completedAt,
        isLate: !!t.late,
        pointsAwarded: t.status === "completed" ? rt.pointsBase : 0,
        finalRating: t.status === "completed" ? (s.archetype === "star" ? 5 : 4) : null,
      });
    }
  }
  console.log("✅ Enrollments + assigned tasks created\n");

  // ── Blockers + accepted delays (drive watch/fighting + fairness credit) ───────
  console.log("🚧 Adding blockers, delays, notes & schedules…");
  const noor = mentees["mentee.noor"].user;
  const ivan = mentees["mentee.ivan"].user;
  const sara = mentees["mentee.sara"].user;

  await models.Blocker.create({
    menteeId: noor.id, createdBy: noor.id, title: "Stuck on JWT refresh-token flow",
    category: "technical", severity: "medium", status: "open", openedAt: daysAgo(3),
  });
  await models.Blocker.create({
    menteeId: ivan.id, createdBy: ivan.id, title: "Exam week — limited availability",
    category: "personal", severity: "medium", status: "open", openedAt: daysAgo(5),
  });
  await models.Blocker.create({
    menteeId: sara.id, createdBy: aisha.id, title: "No response — needs outreach",
    category: "personal", severity: "high", status: "open", openedAt: daysAgo(6),
  });

  // Noor: accepted external (job) delays → fairness credit lifts relative progress.
  await models.DelayEvent.create({
    menteeId: noor.id, reason: "Overtime at work during release week.",
    kind: "job", days: 4, accepted: true, category: "external", createdBy: omar.id, occurredAt: daysAgo(8),
  });
  await models.DelayEvent.create({
    menteeId: noor.id, reason: "Power outages disrupted study time.",
    kind: "electricity", days: 2, accepted: true, category: "external", createdBy: omar.id, occurredAt: daysAgo(3),
  });

  // ── Meeting notes (1:1s with a personality read) ──────────────────────────────
  await models.MeetingNote.create({
    menteeId: mentees["mentee.maya"].user.id, mentorId: aisha.id, createdBy: aisha.id,
    date: daysAgo(4), type: "1:1", sentiment: "positive",
    summary: "Maya is well ahead and ready for a stretch goal. Walked through the API task early.",
    issues: [], nextSteps: ["Start the Express auth task", "Pair with a peer on testing"],
    personalityRead: "Highly self-directed, learns fast, thrives on autonomy.",
    workingStyle: { consistency: 90, communication: 80, resilience: 85, independence: 95 },
    blockers: [],
  });
  await models.MeetingNote.create({
    menteeId: noor.id, mentorId: omar.id, createdBy: omar.id,
    date: daysAgo(3), type: "1:1", sentiment: "neutral",
    summary: "Noor is juggling a full-time job. Behind on raw % but clearly putting in real effort. Logged delays as accepted.",
    issues: ["Limited weekday hours"], nextSteps: ["Break the API task into smaller chunks", "Check in mid-week"],
    personalityRead: "Conscientious and honest about constraints; communicates blockers early.",
    workingStyle: { consistency: 70, communication: 85, resilience: 80, independence: 65 },
    blockers: ["JWT refresh-token flow"],
  });

  // ── Schedules (org template + a couple of filled mentee schedules) ────────────
  const orgTemplate = await models.ScheduleTemplate.create({
    name: "Fellowship Weekly Rhythm", scope: "org", createdBy: admin.id,
    blocks: [
      { day: "Monday", label: "Clan standup", start: "09:00", end: "09:30" },
      { day: "Wednesday", label: "Focused build time", start: "14:00", end: "17:00" },
      { day: "Friday", label: "Mentor 1:1", start: "11:00", end: "11:30" },
    ],
  });
  const filledSchedule = [
    { day: "Monday", label: "Clan standup", start: "09:00", end: "09:30" },
    { day: "Wednesday", label: "Focused build time", start: "14:00", end: "17:00" },
    { day: "Friday", label: "Mentor 1:1", start: "11:00", end: "11:30" },
  ];
  await models.MenteeSchedule.create({
    menteeId: mentees["mentee.maya"].user.id, templateId: orgTemplate.id, schedule: filledSchedule, assignedBy: aisha.id,
  });
  await models.MenteeSchedule.create({
    menteeId: noor.id, templateId: orgTemplate.id, schedule: filledSchedule, assignedBy: omar.id,
  });

  // ── Announcements (org broadcasts) ─────────────────────────────────────────────
  await models.Announcement.create({
    title: "Welcome to the Spring 2026 Fellowship!", authorId: admin.id, audience: "all", pinned: true,
    body: "We're thrilled to kick off the cohort. Meet your clan, set up your schedule, and start Week 1. Reach out to your mentor anytime.",
  });
  await models.Announcement.create({
    title: "Week 7 — APIs & data modeling", authorId: admin.id, audience: "program", audienceId: program.id, pinned: false,
    body: "We're entering the backend stretch. Office hours are extended this week — book a slot with your mentor if you're stuck.",
  });

  console.log("✅ Blockers, delays, notes, schedules & announcements created\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Demo data ready!  All accounts use password:  " + DEMO_PASSWORD);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Admin    admin" + DEMO_DOMAIN);
  console.log("  Mentor   mentor.aisha" + DEMO_DOMAIN + "   (Frontend Clan)");
  console.log("  Mentor   mentor.omar" + DEMO_DOMAIN + "    (Backend Clan)");
  console.log("  Mentee   mentee.maya" + DEMO_DOMAIN + "    (star)");
  console.log("  Mentee   mentee.sara" + DEMO_DOMAIN + "    (at risk)");
  console.log("  Mentee   mentee.noor" + DEMO_DOMAIN + "    (struggling, fighting)");
  console.log("  …+ 5 more mentees spanning on-track / watch / review / new");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Demo seed failed:", err.message);
    if (err.errors) err.errors.forEach((e) => console.error("   •", e.message));
    if (err.original) console.error("   Details:", err.original.message);
    process.exit(1);
  });
