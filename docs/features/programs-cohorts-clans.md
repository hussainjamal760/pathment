# Programs, Cohorts & Clans

**What it is:** the org structure everything hangs off. A **Program** is the offering; a
**Cohort** is a season of intake for it; a **Clan** is a mentor-led group of mentees inside
the program; **ClanMembership** records who's in a clan and in what role.

**Why it exists:** mentorship scales by grouping. Instead of 1:1 chaos, mentees are placed
into clans led by mentors, within a program, admitted via a cohort.

## Data model
`Program` (type, status `draft|published|archived`, visibility `private|public`,
enrollments). `Cohort` (intake season — see [Intake](./intake-and-assessments.md)). `Clan`
(programId, leadMentorId, maxMentees, healthStatus). `ClanMembership` (clanId, userId, role
`lead_mentor|co_mentor|mentee|core_team`, status, enrollmentId). `ClanChangeRequest`
(permanent move between clans). `CrossClanAssignment` (temporary cross-clan help:
`cover|specialist|co_mentee_access`). See [DATABASE.md §5](../DATABASE.md).

## Backend
- **Programs (`/api/programs`):** list (public sees published+public; admins/creators see all), detail, create/clone (mentor+admin), update/delete (ownership-checked), stats, enrollments.
- **Clans (`/api/clans`):** list, detail, `me/memberships`, `mentor/programs`, `health` + `insights` (`analytics.view`), create (`clan.create`), update + member add/remove (`clan.manage_members` scoped to the clan). `clanService.addMember(clanId,{userId,role})` is how a co-mentor/core-team member is added — and the authz engine derives that person's clan permissions from the membership.
- **Clan requests (`/api/clan-requests`, mostly `clan.manage_members`):** change-request create (mentee) + resolve; cross-clan create/remove; org policies.

## Frontend
- **Admin:** `/admin/programs/list` + `/admin/programs/[id]`, `/admin/clans`, `/admin/requests` (change requests, cross-clan, policies), `/admin/insights` (clan health/fairness).
- **Mentor:** `/mentor/programs` (+ `[id]`) — programs they run; **`/mentor/clan-team`** — manage their clan's co-mentors/core-team (lead mentors only).
- **Mentee:** sees their clan implicitly (via enrollment + community space).

## Role flows
- **Admin:** creates programs, opens cohorts, creates clans, assigns lead mentors, places mentees (via accept/enrollment), resolves clan change requests, and sets up cross-clan help (cover/specialist).
- **Lead mentor:** runs their clan — adds **co-mentors / core-team** on the Clan Team page, renames the clan; reviews/mentors its members.
- **Co-mentor:** mentors within the clan (review tasks, see mentees) but **cannot** change membership.
- **Mentee:** belongs to one clan; can request a clan change (admin resolves).

## Rules & edge cases
- Program `visibility` gates discovery: only published+public programs appear to non-admins / the public catalog.
- Clan roles are the clan-scoped half of [RBAC](./authorization-rbac.md) — membership *is* the grant.
- **Clan change request = permanent move; cross-clan assignment = temporary, revocable help.** Don't confuse them.
- A clan has one lead mentor (`leadMentorId`); the first mentor added becomes lead.

## Related
[Intake & Assessments](./intake-and-assessments.md) · [Enrollment & Progress](./enrollment-and-progress.md) · [Matching & Placement](./matching-and-placement.md) · [Authorization](./authorization-rbac.md)
