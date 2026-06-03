# Pathment Cockpit — Gap Analysis & Build Direction

**Branch:** `feat/pathment-cockpit-prototype`
**Date:** 2026-06-03
**Scope:** What it takes to bring the `new designs` prototype's feature set into the live `client-interface` (Next.js) + `server` (Express/Sequelize/Postgres), while preserving the current system's structure and proven features.

> **Status of this doc:** authoritative direction for the cockpit work. Section 7 records the product/architecture decisions already made; everything else flows from them.

---

## 1. Headline finding

The live product and the `new designs` prototype are **not the same app with more screens** — they encode **two different mental models of mentorship**. This is a **domain extension**, not a UI refresh.

| | **Live system (today)** | **New designs (target)** |
|---|---|---|
| Organizing unit | `Program → Level → Roadmap → Week → Task` (a curriculum tree) | `Org → Program → Clan → (optional Levels) → Roadmaps`, day-shaped by a **schedule of slots** |
| Progress | One number (`overallProgressPercentage`) | **Two numbers: absolute vs relative** (fairness-adjusted for logged friction) |
| Time model | Week-indexed (`currentWeek`) | **Day-shaped** (named slots: morning/lunch/anytime…), logged daily |
| Mentor's job | Approve & grade submissions | **Triage a cohort by risk**, run a keyboard-driven weekly review, coach to working-style |
| "Why is someone behind?" | Not modeled | **First-class**: `DelayEvent` + `Blocker` + AI fairness categorization (external / scope / avoidance) |
| AI | Roadmap generation + match suggestions (server-side) | **7 explainable features**, bring-your-own-key, per-feature routing |

The live system's foundations are strong and **mostly reused**: **52 Sequelize models, 141 endpoints**, JWT + 2FA + invites, programs/roadmaps/assigned-tasks/submissions/feedback, messaging, notifications (matrix-driven), gamification, analytics, audit. The prototype **layers on top** — except for three cross-cutting concepts (schedules/slots, linear roadmap-chains, relative progress) that touch everything.

---

## 2. Decision: keep Next.js + server, layer the prototype in

The prototype (`new designs/`) is a **Vite + React Router SPA on mock data** — a design artifact, not shippable code. The live `client-interface` is **Next.js 16 (App Router) + axios + Socket.IO** against the real API.

**We keep the Next.js client and the Express server, and port the prototype's screens, components, and data model into them.** The prototype's value is its **IA, interaction design, and `types.ts` data model** — all portable. We do **not** adopt Vite (it would discard working auth, token-refresh, 2FA, RBAC guards, real-time, and a 47-component Radix design system).

**One real cost:** the prototype's visual language (calm/premium, mono numerals, tinted AI panels) differs from the current admin-style UI. Porting requires a **design-system reconciliation pass** (tokens, spacing, and the new `DualProgress` / `AISummary` primitives), not just dropping pages in.

---

## 3. Canonical hierarchy (decided)

```
Organization
 └─ Program                         one per year; an org runs several concurrently   [extend existing Program]
     └─ Clan / Cohort / Group       mentor-led group of mentees                       [NEW: Clan]
         ├─ Mentors (1..n)          a clan can have multiple mentors                   [NEW: ClanMentor join]
         ├─ Levels (0..n, OPTIONAL) clan's choice — level-wise roadmaps OR just one    [reuse ProgramLevel, make clan-scoped & optional]
         ├─ Roadmaps (linear)       authored by clan mentor OR imported from org/admin [REMODEL Roadmap]
         │     AI-generated or manual; ordered steps; auto-advance on approval
         └─ Mentees (enrolled)      enrolled into the clan, not just the program       [Enrollment → clan-scoped]
```

Implications:
- **`Program`** stays as the yearly container (extend, don't replace).
- **`Clan`** is a new entity between Program and mentees. It owns its mentors, its (optional) levels, and its roadmaps.
- **Levels are optional and clan-owned.** A clan mentor may run level-wise roadmaps or a single roadmap.
- **`Enrollment`** becomes **clan-scoped** (mentee belongs to a clan within a program), and `MentorMenteeMatch` is largely subsumed by clan membership + per-mentee mentor assignment.

---

## 4. Roadmaps: remodel to the prototype's linear model (decided)

**Today:** `Program/Level → Roadmap → RoadmapWeek → RoadmapTask` (week-bucketed, program-bound).
**Target (prototype):** a `Roadmap` is an **ordered flat list of `RoadmapStep`s** with `source: org | local`, `published`, `importedFrom`, optional `skillTags`, and **auto-advance on approval**; per-mentee position tracked by `RoadmapProgress.currentStep`.

**Decision: remodel (cleaner, riskier) rather than run a parallel model.** Plan:
- New `Roadmap` shape = ordered `RoadmapStep[]`. Keep `RoadmapWeek` only as an **optional grouping label** on a step (or drop entirely) — weeks are no longer the structural unit.
- `source` distinguishes **org/admin roadmaps** (publishable, importable) from **clan-local** ones a mentor authors.
- `importedFrom` records the org roadmap a local copy came from.
- **AI-generated or manual:** reuse the existing AI roadmap-generation path to emit ordered steps; manual authoring via the Roadmaps screen.
- `RoadmapProgress(menteeId, roadmapId, currentStep, slot, completed)` tracks each mentee, and supports **per-mentee start-step** (skip foundational steps).
- **Auto-advance:** a review with an `approved*` decision on a roadmap-linked task marks the current step done, creates the next `RoadmapProgress`, and auto-assigns the next step's task (the `ChainAdvanceModal` flow).
- **Migration:** flatten existing week→task roadmaps into ordered steps; write a one-off migration + verify against live data before cutover.

---

## 5. Domain-model gap

### 5.1 Keep as-is
`User / MentorProfile / MenteeProfile / AdminProfile`, `Skill / UserSkill`, all **auth** (JWT, 2FA, invites, sessions), `TaskSubmission(+File)`, `Conversation/Message/Notification`, **gamification**, **analytics**, `AuditLog`, `FileUpload`, `EmailQueue`, `SystemSettings`, `UserSettings`.

### 5.2 Extend existing models
| Prototype concept | Live model | What to add |
|---|---|---|
| Yearly container, many concurrent | `Program` | confirm year/term fields; becomes parent of Clans |
| Clan-scoped enrollment | `Enrollment` | add `clanId`; keep program link; `relativeProgress` (computed) alongside absolute |
| `TaskScore {speed, mentor}` | `AssignedTask.finalRating` | split into auto **speed** score (submit-vs-due) + manual **mentor** 1–5 |
| 4-decision review + ticked checklist | `TaskFeedback` | add `decision` enum (`approved/approved_notes/changes/rejected`) + persisted ticked-criteria labels |
| `risk / momentum / sentiment / riskReason` | `MenteeProfile` + `MenteeAnalytics` | add per-mentee rollups the Cockpit reads |
| Status vocabulary | `AssignedTask.status` | reconcile: server `not_started/revision_needed/cancelled` vs design `under_review/changes_requested/rejected` |
| Optional, clan-owned levels | `ProgramLevel` | re-scope to clan; make optional |

### 5.3 Net-new models
1. **`Clan`** — program-child, mentor-led; RAG status, leader, cohort metrics (the prototype's `ProgramHealth` type is the read model for this).
2. **`ClanMentor`** — join (a clan has many mentors; reuses ideas from `LevelMentorAssignment`).
3. **`Track`** — personal lane of work per mentee (`source: blank/template/program`, archived) + `TaskTemplate` / `TrackTemplate` libraries.
4. **Schedule system** — `ScheduleTemplate` (org/mentor, pure time-blocks), `TimeBlock`, `SlotConfig` (slot → roadmap-chain **or** recurring ritual, `bookable`), `ScheduleAssignment` (per-mentee filled schedule). **Largest new subsystem; reshapes how tasks get assigned.**
5. **`RoadmapProgress`** — per-mentee step position (see §4).
6. **`DailyLogEntry`** — slot ticks + task ticks + per-item notes + free note, with **backfill**.
7. **`DelayEvent`** — friction logging (`kind`, `days`, `accepted`) + AI `category` (external/scope/avoidance) + `aiRationale`. **The fairness engine's input.**
8. **`Blocker`** — task-linked, categorized, severity, resolve toggle.
9. **`Insight`** — structured mentor observations (personality/analytical/issue/strength/general, source).
10. **`MeetingNote` + `ScheduledMeeting` + `AvailabilitySlot`** — Calendly-style 1:1 availability/booking + logged notes with sentiment. (Live system has no scheduling.)
11. **`Collaborator`** — invite specialists (psychologist, coach) to a mentee; attributed logging.
12. **`Personality`** (consistency/communication/resilience/independence) — on `MenteeProfile`.
13. **AI config** — `AIKey` (BYO-key, masked, per-mentor, **encrypted at rest**) + `AIRouting` (feature → key).
14. **`ReleaseNote`**, **`Document`** (org library), **`FeedbackTemplate` / `MessageTemplate`**, **`AttendanceRecord`** — low-risk.

---

## 6. Server changes by area (effort-sized)

- **Data layer (L) — largest:** ~13 new models + migrations + associations + the §5.2 extensions + the §4 roadmap remodel/migration. Schedules and roadmaps dominate.
- **Progress engine (M):** service computing **relative progress** from `AssignedTask` timing + accepted `DelayEvent`s + open `Blocker`s, plus `risk/momentum/sentiment` rollups. Needs a clear spec + tests.
- **Roadmap auto-advance (M):** wire into the existing review path.
- **Scheduling/booking (M):** availability publish + book → `ScheduledMeeting`; hook into notifications.
- **Daily-log + friction/blocker endpoints (M):** CRUD + backfill + mentor "accept delay" action.
- **AI subsystem (M–L):** provider abstraction over groq/openai/anthropic/gemini/custom, encrypted per-mentor key vault, per-feature routing, 7 prompt pipelines. **Builds on existing `groqService`/`openaiService`.** Keep AI advisory (surface `aiSignals`/`aiRationale`; mentor accepts/overrides).
- **Clan endpoints (M):** clan CRUD, mentor assignment, enrollment-into-clan, clan-health rollups.
- **Reuse, don't reinvent:** route all new events (nudges, friction, bookings) through the existing **`notificationOrchestrator` + matrix**.
- **Untouched:** auth, gamification, file uploads, email queue, audit.

---

## 7. Decisions on record

1. **Delivery:** Layer the prototype into the **existing Next.js client + Express server**. No Vite migration.
2. **Hierarchy:** `Org → Program (yearly) → Clan → (optional, clan-owned Levels) → Roadmaps → Mentees`. Clan mentors author or import roadmaps.
3. **Roadmaps:** Adopt the prototype's **linear ordered-step model**; remodel the week-based roadmap and migrate (cleaner, riskier — accepted). AI-generated or manual, mentor's choice.

Still open (not blocking Phase 0–1):
- Exact relative-progress formula (weights for accepted delays vs blockers vs raw timing).
- Whether `RoadmapWeek` is dropped entirely or kept as an optional step-grouping label.
- Multi-mentor permissions within a clan (lead vs co-mentor).

---

## 8. Client changes by area

Prototype is **mentor-centric**; live app is **admin/CRUD-centric**.

- **Mentor (biggest delta):** add **Cockpit** (risk-sorted cohort), **Cohort Review** (keyboard ←→/A guided flow — flagship, no analog today), **At-Risk** (disengaged vs struggling segmentation), **Roadmaps** (linear authoring + import + per-mentee start-step), **Schedules** (slot/availability builder), rich **MenteeProfile** (AISummary, DualProgress, blockers/delays/insights/personality/collaborators), **Approvals** (bulk-approve + ReviewDrawer), **Library**, **Settings/AI keys**. ~8 screens + ~12 drawers/modals.
- **Mentee:** add **This Week** (single hero action), **Daily Log** (slot/task ticking + backfill), **My Progress** (dual progress), **Blockers**, **Meetings** (book from availability); rework **TaskDetail** (request extension, log blocker/friction framed as *helping*). ~5 reworked screens.
- **Admin:** reframe to **Clan Health (RAG)**, **People** directory, **Org Insights**, **Release Notes**, **Library** — while keeping current admin CRUD (programs, invites, matching, user mgmt) underneath.
- **Cross-cutting:** Command Palette (Cmd-K), `DualProgress` / `AISummary` primitives, notification deep-linking, role switcher. Current app uses **manual `useState/useEffect` fetching with no cache** — the volume of cross-referencing screens (Cockpit, profile) makes introducing **React Query** worthwhile (recommended, optional).

---

## 9. Phasing

- **Phase 0 — Foundations (no user-visible change):** reconcile status vocab; add `risk/momentum/sentiment/relativeProgress` fields; add `Blocker` + `DelayEvent` models + endpoints; introduce `Clan` + `ClanMentor` + clan-scoped `Enrollment`. Low risk, unlocks everything.
- **Phase 1 — Fairness core (highest value, lowest structural risk):** mentee friction/blocker logging on TaskDetail; `DualProgress` / `AISummary` primitives; relative-progress engine; mentor MenteeProfile read. Proves the differentiator on existing tasks.
- **Phase 2 — Mentor cockpit:** Cockpit, At-Risk, Approvals + ReviewDrawer (4-decision), bulk-approve. Reuses existing submission/feedback APIs.
- **Phase 3 — Schedules & linear roadmaps:** the structural heavy lift (slots, ordered roadmaps + migration, auto-advance, daily log). Do after Phase 0–2.
- **Phase 4 — Scheduling/1:1 booking, collaborators, insights, AI key routing, admin clan-health, release notes.**

**Rough sizing:** server ≈ 13 new models + ~6 new service areas + roadmap migration; client ≈ 18 new/reworked screens + ~12 drawers + 2 new primitives. **Multi-month build**, but ~60–70% of the substrate already exists and is reused.

---

## 10. Risks

- **Roadmap remodel + data migration** (chosen path) — highest structural risk; gate behind a verified migration on a DB copy.
- **Schedule subsystem** reshapes task assignment; design the slot→task linkage before building screens.
- **AI key storage** — encryption at rest + scoping per mentor; needs a security review.
- **Design-system drift** between prototype and live UI — budget a reconciliation pass.
- **No client cache today** — cross-referencing cockpit screens will hammer the API without React Query or equivalent.

---

## 11. Addendum — 10 new pages (commit `9ad58ba`)

A later pull added **10 new pages** (~3.6k lines). Important: this commit **did not touch `src/lib/types.ts`** — the formal data model is unchanged. These pages run on **inline/local mock shapes**, so their backend needs are *inferred from the UI*, not yet modeled. Several extend the **Clan** concept from §3, which fits cleanly.

New nav routes: mentor → `/scores`, `/reports`, `/leaderboard`, `/rewards`, `/promotions`, `/spec`; admin → `/clans`, `/requests`, `/announcements`; mentee → `/community`.

### Classification

**A. No backend (static / pure UI)**
- **MentorSpec** (`mentor/MentorSpec.tsx`) — onboarding reference: mission, principles, responsibilities, code of conduct, FAQs + a local checklist. Hardcoded content; ship as static/CMS, no API.

**B. Reuses existing backend (gamification / analytics / levels)**
- **Leaderboard** (`mentor/Leaderboard.tsx`) — XP/streak/badge rankings, podium + standings, clan filter. XP/level/streak are **computed locally** from existing mentee stats; maps onto existing `Badge / UserBadge / PointsHistory / LeaderboardEntry`. Mainly needs the rankings exposed via an endpoint.
- **ProgressScores** (`mentor/ProgressScores.tsx`) — a single blended 0–100 score per mentee (absolute 45% / relative 35% / on-time 20% / momentum), detail drawer with the 4 personality bars. Reuses `MenteeAnalytics` + the new progress fields; **one small new field**: persisted mentor feedback note per mentee.

**C. Reuses + modest new**
- **Clans** (`admin/Clans.tsx`) — catalog of clans by **technology track** + **level**, with operational **status (green/amber/red)** and per-clan **communities**. Directly the `Clan` entity from §3; **new bits**: `tech`/`tags` + `status` on Clan, and a `Community` concept (handle, members, activity).
- **Reports** (`mentor/Reports.tsx`) — AI-generated weekly/monthly cohort summary (highlights, at-risk, recommended actions) + auto-drafted encouragement emails + report archive. Reuses mentee/clan stats; **new**: a `Report` record/archive, an AI summarization call (fits the §6 AI subsystem), and **email scheduling** (reuse `EmailQueue` + notification matrix).

**D. Net-new subsystems (new tables + endpoints + workflow)**
- **Promotions** (`mentor/Promotions.tsx`) — pipeline to elevate strong mentees to **co-mentors**: stages `nominated → interview → approved → promoted`, readiness/willingness scores, interview form (motivation, availability, strengths). New: `PromotionCandidate` + `InterviewRecord` + a stage state-machine, **and a role-elevation path** (mentee → co-mentor) that interacts with `User.role`, clan mentor assignment, and the multi-mentor-per-clan question in §7.
- **Rewards** (`mentor/Rewards.tsx`) — XP **economy**: redeemable gift catalog (stock + XP cost), milestone unlocks, **referrals** (invite link + bonus tracking), and a **talent network** (nominate mentees to partner companies). New: `Gift`, `Redemption`, `Milestone`, `Referral`, `TalentNomination` — the largest net-new subsystem here; ties XP spend to the existing points ledger.
- **Announcements** (`admin/Announcements.tsx`) — org broadcast channel (audience = all/program, pinned, **reactions**: acknowledged/helpful). Overlaps `ReleaseNote` but adds reactions + a persistent feed. New: `Announcement` + `AnnouncementReaction`; deliver via notification matrix.
- **ClanRequests** (`admin/ClanRequests.tsx`) — approve mentee **clan-change requests**, manage **cross-clan assignments** (a mentor covers another clan, a psychologist is attached, co-mentee access), and view **org policies**. New: `ClanChangeRequest` (+ approval workflow & cooldown policy), `CrossClanAssignment`, `OrgPolicy`. Directly extends the Clan model and overlaps the §5.3 `Collaborator` concept.
- **Community** (`mentee/Community.tsx`) — cohort **social feed**: posts typed kudos/win/question/meme, kudos target a mentee, reactions (cheers/helpful), shout-outs rail. New: `Post` (+ denormalized reaction counts) scoped to clan/cohort.

### Summary

| Page | Role | Backend |
|---|---|---|
| MentorSpec | Mentor | None (static) |
| Leaderboard | Mentor | Reuses gamification |
| ProgressScores | Mentor | Reuses analytics + 1 new field |
| Clans | Admin | Extends Clan + new Community/status |
| Reports | Mentor | Reuses stats + AI + email (new Report archive) |
| Promotions | Mentor | **Net-new** (co-mentor pipeline + role elevation) |
| Rewards | Mentor | **Net-new** (XP economy: gifts/referrals/talent) |
| Announcements | Admin | **Net-new** (broadcast + reactions) |
| ClanRequests | Admin | **Net-new** (clan-change/cross-clan/policies) |
| Community | Mentee | **Net-new** (social feed) |

### Impact on the plan
- **2 pages need no backend, 3 mostly reuse existing** — quick wins once the core ships.
- **5 net-new subsystems** are mostly **community/operations/rewards** features that sit *above* the learning core. They should land in **Phase 4+**, after the fairness core, cockpit, and schedule/roadmap work — they're valuable but not on the critical path.
- **Promotions introduces a real structural thread**: a **mentee→co-mentor role-elevation path**, which couples to the multi-mentor-per-clan permission question already flagged open in §7. Decide that before building Promotions.
- Because none of this is in `types.ts` yet, the shapes above are **inferred from the UI** — they should be formalized (ideally back into the prototype's `types.ts`) before backend modeling.
