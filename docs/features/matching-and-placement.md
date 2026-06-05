# Matching & Placement

**What it is:** how a mentee ends up with a mentor. Pathment uses **clan-based placement**
(a mentee joins a clan and inherits its mentor[s]) with optional **AI match suggestions** to
help admins place people well.

**Why it exists:** good mentor↔mentee fit drives outcomes. Placement is mostly structural
(via clans), and AI scoring assists the judgement call rather than replacing it.

## Data model
`MentorMenteeMatch` (mentorId, menteeId, enrollmentId, matchedBy, matchScore, matchReason,
status `pending|active|completed|cancelled`, satisfaction ratings). Placement itself lives
in `ClanMembership` + `Enrollment`. See [DATABASE.md §7](../DATABASE.md).

## Backend
- **`/api/matching`:** `POST /` create a match, `POST /auto-match` auto-match pending (admin / `mentee.manage`), `GET /suggestions/:enrollmentId` AI suggestions, `GET /mentor-levels`, `GET /`, `PATCH /:id/status`, `PATCH /:id/rate` (mentee/mentor/admin submit satisfaction).
- **Service:** `matchingService` builds mentor/mentee payloads and calls `groqService.batchGenerateMatchingScores(...)` (feature `'matching'`, BYO-key resolved — see [AI](./ai-integration.md)); falls back to heuristic scoring if AI is unavailable. Returns ranked mentors with score + reasoning + strengths/concerns.

## Frontend
- **Admin:** `/admin/matching/mentor-assignment` — review AI suggestions and assign; placement also happens at intake **Accept** (choose a clan) and via clan membership.

## Role flows
- **Admin:** opens an enrollment's suggestions → sees ranked mentors (AI score + reasoning) → assigns, or runs auto-match for the pending queue. Most placement is done by choosing a clan at accept time.
- **Mentor:** receives mentees via clan membership; can rate the match.
- **Mentee:** is placed (no self-select); can rate their match.

## Rules & edge cases
- AI scoring is **advisory** — a human assigns. If no AI key/connection resolves, heuristic scoring is used so the feature never hard-fails.
- Matching is an org-level admin action, so it uses org-routed AI keys.
- Clan placement is the primary mechanism; explicit `MentorMenteeMatch` rows capture the relationship + satisfaction.

## Related
[Programs, Cohorts & Clans](./programs-cohorts-clans.md) · [Enrollment & Progress](./enrollment-and-progress.md) · [AI Integration](./ai-integration.md)
