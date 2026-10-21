# Selection Pools

**What it is:** a real pre-clan state. Candidates who are on Pathment but not yet in a clan
are tested with ordinary Pathment work, reviewed, scored, shortlisted and only then placed
into clans with their mentor team.

**Why it exists:** task assignment assumed a clan, so testing 300 people before choosing 50
meant a fake clan, which made enrolment, progress, analytics and permissions all lie. A pool
keeps qualification work out of every clan and enrolment number until somebody is placed.
Pool size and quota are configuration, never constants.

## Data model
- `CandidatePool` (`candidate_pools`): programme, optional cohort, `status`
  `draft | open | qualifying | reviewing | placing | closed`, `capacity`, `selectionQuota`,
  dates, `scoringPolicy` (versioned components with weights and the work behind each),
  `reminderPolicy`, `shortlistSnapshots` (every proposal ever made, newest last).
- `PoolMember` (`pool_members`): one candidate. `email` is the dedupe key (unique per pool),
  `userId` is null until an invited candidate registers. `status` is how far the work has
  got; `decision` (`selected | waitlisted | not_selected | withdrawn | disqualified`) is the
  human outcome; `placedAt` is separate from `selected` because a clan can be full.
- `AssignedTask.poolMemberId`: marks qualification work. Such a task has no clan and no
  enrolment, earns no points, and is reviewed from the pool, not a mentor's queue.

Migration: `server/scripts/migrations/140_candidate_pools.js`.

## Backend
- **Permissions** (program scope): `pool.manage`, `pool.members`, `pool.assign`,
  `pool.review`, `pool.select`. `program_admin` holds all five; the new built-in
  `pool_reviewer` role holds `pool.review` only.
- **Service:** `poolService` (all logic), `utils/poolScoring.js` (pure scoring, ranking and
  dashboard buckets, unit-tested in `tests/unit/pool-scoring.test.js`).
- **API** `/api/pools`:
  `GET /` · `POST /` · `GET /:id` (dashboard) · `PATCH /:id` · `POST /:id/status` ·
  `POST /:id/members` (import emails) · `POST /:id/members/:memberId/remove` ·
  `POST /:id/work` · `GET /:id/reviews` · `POST /:id/shortlist` · `POST /:id/finalize` ·
  `POST /:id/placements` · `GET /mine` (candidate's own view).
- **Reuse:** submission, quiz, interview and review flows are unchanged. `authzService`
  scopes a pool task to the pool's programme and maps `task.review`/`task.assign` to
  `pool.review`/`pool.assign` for it, so a programme's clan mentors cannot mark candidates.
- **Reminders:** `notificationScheduler.sendPoolReminders` → `poolService.sendReminders`.

## Frontend
- **Admin:** `/admin/pools` (list, new pool) and `/admin/pools/[id]` with Candidates,
  Work, Reviews (the mentor `ReviewDrawer`) and Selection tabs. Nav: Admissions →
  Selection pools, gated on `pool.review`.
- **Candidate:** `/mentee/qualification` plus a card on the mentee dashboard. Work opens in
  the normal `/mentee/tasks/[id]` screen.

## Role flows
- **Pool operator:** creates a pool with weights and a quota → adds emails (existing
  accounts join, others get an invite) → assigns work per component → watches buckets
  → proposes a shortlist → resolves ties and overrides with reasons → confirms → places
  selected candidates into clans.
- **Pool reviewer:** marks submissions from the Reviews tab. Does not become the mentor.
- **Candidate:** registers from the invite (restricted account: no enrolment, no clan),
  does the work, sees feedback and the final outcome. Never sees a score or rank.
- **Mentor:** hears about a candidate only once placement has created the enrolment and
  clan membership.

## Rules & edge cases
- Importing is idempotent: emails are normalised, a repeat is reported as already in the
  pool, and an existing active invite is reused rather than duplicated.
- An invited candidate gets the pool's work when they register (matched on email).
- A task's score is its reviewed rating as a percentage; an auto-graded quiz reviews itself
  with its percentage. Undelivered work scores 0; submitted-but-unreviewed work blocks.
- Shortlists are deterministic (total desc, then email) and stored only when they change.
  Assigning work or changing weights bumps the policy version; a stale shortlist must be
  proposed again before it can be confirmed.
- Confirmation is refused while work waits for review or while a tie straddles the
  cutoff without a decision for every tied candidate. Every manual change needs a reason
  and is written to the audit log.
- Withdrawing, disqualifying or confirming cancels the candidate's open pool work, which
  is what stops their reminders; reminders also stop when the pool leaves qualifying.
- Placement runs per candidate: it checks programme, frozen clan, lead mentor and
  `maxMentees`, then creates the enrolment and membership through `clanService`. A retry
  skips anybody already placed.
- Points are always off for pool work in this version.

## Related
[Intake & Assessments](./intake-and-assessments.md) · [Matching & Placement](./matching-and-placement.md) ·
[Authorization](./authorization-rbac.md) · [Roadmaps & Tasks](./roadmaps-and-tasks.md)
