# Enrollment & Progress

**What it is:** the mentee↔program link (`Enrollment`) and the **single source of truth for
progress** — how far someone is, whether they're done, and how completion is confirmed.

**Why it exists:** progress drives everything (dashboards, at-risk, fairness, completion).
It must be computed one way, consistently, so the system never lies about how far someone is.

## Data model
`Enrollment` (menteeId, programId, cohortId, status
`pending_approval|pending_match|matched|active|pending_completion|level_completed|program_completed|dropped`,
`tasksTotal`, `tasksCompleted`, `overallProgressPercentage`, completion request/approve
fields). `ProgramReview` (anonymous mentee→mentor feedback at completion). See
[DATABASE.md §7](../DATABASE.md).

## Backend
- **`/api/enrollments`:** `GET /` (role-scoped) + `GET /:id`, `GET /stats` (`analytics.view`), `POST /` create + `approve`/`reject` + `DELETE` (`mentee.manage`), `PATCH /:id/status`, and the **completion** trio: `request-completion` (mentee/mentor), `approve-completion` / `reject-completion` (mentor/admin).
- **Progress:** `taskService.updateEnrollmentTaskStats(enrollmentId)` recomputes `tasksTotal/tasksCompleted/overallProgressPercentage/status` from **live assigned tasks** on every assign/submit/review. This is the only place progress is written.
- **Completion:** mentor-confirmed — when all tasks are done the enrollment goes `pending_completion`; a mentor/admin signs off → `program_completed`, which can trigger anonymous program feedback. (Mentees can't self-complete.)
- **Program reviews (`/api/program-reviews`):** mentee submits anonymous structured feedback for a completed enrollment; mentors see an aggregate (gated by a minimum response count); admins see raw feedback (`analytics.view`).

## Frontend
- **Admin:** `/admin/enrollment/overview` (place, track, approve/reject).
- **Mentor:** completion sign-off surfaces in Cohort Review / Approvals; `/mentor/scores` (progress scores), `/mentor/reports`.
- **Mentee:** `/mentee/progress` (own progress), `/mentee/feedback/[id]` (submit program review).

## Role flows
- **Admin:** creates/approves enrollments, monitors progress + stats, can remove an enrollment.
- **Mentor:** confirms completion when a mentee is ready (the "ready for sign-off" notification), reviews progress, reads aggregate feedback about themselves.
- **Mentee:** works tasks → progress updates automatically → when finished, completion is requested and a mentor signs off → mentee leaves anonymous feedback.

## Rules & edge cases
- **Progress is task-based, not template-based** — counts non-cancelled assigned tasks, so it's always honest (this fixed the "100% with tasks pending" bug).
- Completion is **mentor-confirmed**, not mentee self-served.
- Program feedback is **anonymous** and gated by a minimum number of responses so individuals can't be identified.
- "Accepted" delays lift *relative* progress (fairness) — see [Blockers & Delays](./blockers-and-delays.md).

## Related
[Roadmaps & Tasks](./roadmaps-and-tasks.md) · [Blockers & Delays](./blockers-and-delays.md) · [Analytics & Insights](./analytics-and-insights.md) · [Programs, Cohorts & Clans](./programs-cohorts-clans.md)
