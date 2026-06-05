# Roadmaps & Tasks

**What it is:** the execution engine. A **Roadmap** is an ordered set of **RoadmapTasks**
(templates). Handing one out creates **AssignedTasks** for a mentee, who files versioned
**TaskSubmissions**, which the mentor reviews with **TaskFeedback**. Approving a step can
auto-assign the next.

**Why it exists:** structured, reviewable work is the core of mentorship — clear
deliverables, a submit→review loop, and progress that's measurable.

## Data model
`Roadmap` (programId, `isBaseRoadmap`, `source org|local`, `ownerMentorId`, published).
`RoadmapTask` (type reading/video/exercise/project/quiz/assessment/custom…, difficulty,
`taskOrder`, deliverable, acceptanceCriteria, `dueOffsetDays`, `pointsBase`).
`AssignedTask` (roadmapTaskId, menteeId, mentorId, enrollmentId, trackId, status
`assigned→in_progress→submitted→revision_needed→completed|cancelled`, dueDate, pointsAwarded).
`TaskSubmission` (version, text, urls, status, extension fields) + `TaskSubmissionFile`.
`TaskFeedback` (rating, isApproved, decision `approved|approved_notes|changes|rejected`,
inlineFeedback, checkedCriteria). `Track` (per-mentee personal lanes). See [DATABASE.md §7](../DATABASE.md).

## Backend
- **`/api/tasks`** (assign/list/detail/status) and **`/api/submissions`** (submit with files, review). `taskService` + `submissionService` own the logic; `submissionService.reviewSubmission` advances the roadmap on approval, then recomputes enrollment stats.
- **Roadmap authoring:** **org** roadmaps `/api/roadmaps/org` (`roadmap.author`) — the shared library mentors import; **mentor local** roadmaps under `/api/mentor/roadmaps` (build, import from org, add steps, assign to one/many mentees). `GET /api/roadmaps/me` = a mentee's step progress.
- **Tracks (`/api/tracks`):** per-mentee lanes to organize assigned tasks (create, reorder, archive, add tasks).
- Progress is recomputed by `taskService.updateEnrollmentTaskStats` on every assign/submit/review — the **single source of truth** (see [Enrollment & Progress](./enrollment-and-progress.md)).

## Frontend
- **Mentor:** `/mentor/roadmaps` (build/import/assign), `/mentor/tasks` + `/mentor/tasks/[id]` + `/mentor/tasks/[id]/feedback`, `/mentor/review` (cohort review — assign tasks/roadmaps to many), `/mentor/approvals` (review queue, bulk-approve).
- **Mentee:** `/mentee/tasks` + `/mentee/tasks/[id]` + `/mentee/tasks/[id]/submit` (submit text/links/files, request extension).
- **Admin:** `/admin/roadmaps` (org roadmap library authoring).

## Role flows
- **Admin:** authors the **org roadmap library** (the canonical templates).
- **Mentor:** builds or imports a roadmap, **assigns** it (or single tasks) to mentees; reviews submissions in Approvals/Cohort Review and leaves a decision + feedback (approve / approve-with-notes / request changes / reject); approving advances the mentee to the next step.
- **Mentee:** sees assigned tasks (with deliverable + acceptance criteria), works them, submits (versioned, with files/links), can request an extension; receives feedback and either completes or revises.

## Rules & edge cases
- Submissions are **versioned**; feedback attaches to a version; "request changes" bumps a revision.
- Enrollment progress counts **live (non-cancelled) assigned tasks**, never the template — so completion can't falsely read 100%.
- Org vs local roadmaps: org = shared/published library; local = a mentor's own (can be imported from org).
- `dueOffsetDays` makes a step's due date relative to assignment.

## Related
[Enrollment & Progress](./enrollment-and-progress.md) · [Blockers & Delays](./blockers-and-delays.md) · [Scheduling](./scheduling.md) · [Gamification](./gamification.md) (points from tasks)
