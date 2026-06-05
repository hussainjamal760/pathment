# Analytics & Insights

**What it is:** the measurement layer — activity tracking, pre-computed rollups per
mentee/mentor/program/task, **clan health**, and the **fairness lens** (absolute vs. credited
progress) that powers dashboards and the admin insights page.

**Why it exists:** admins and mentors need to see who's thriving, who's at risk, and whether
clans are healthy — fairly, accounting for accepted friction.

## Data model
`AnalyticsEvent`, `ActivitySession` (active minutes/day), `SkillAssessment` (proficiency
over time), and rollups `TaskAnalytics`, `MenteeAnalytics`, `MentorAnalytics`,
`ProgramAnalytics`, plus `AdaptiveRecommendation` (AI suggestions). Clan health lives on
`Clan.healthStatus`. See [DATABASE.md §11](../DATABASE.md).

## Backend
- **Activity (`/api/activity`):** `session/start|heartbeat|end`, `event`, `page-view`, `me/summary`, `mentee/:id/summary` (mentor/admin), `admin/overview` (`analytics.view`). The heartbeat is beacon-compatible (token in body) for reliable session tracking.
- **Clan health + insights (`/api/clans/health`, `/insights`, `analytics.view`):** `clanHealthService.orgInsights` computes a clan-comparison (worst-first) with the **fairness lens** — comparing absolute progress vs. progress credited for accepted delays.
- Rollups are refreshed by scheduled jobs; the fairness inputs come from [Blockers & Delays](./blockers-and-delays.md).

## Frontend
- **Admin:** `/admin/dashboard` (org health), `/admin/insights` (clan comparison + fairness lens), `/admin/activity` (platform activity).
- **Mentor:** `/mentor/dashboard` (cockpit — who needs attention), `/mentor/at-risk`, `/mentor/scores`, `/mentor/reports` (AI-drafted narrative + PDF).
- **Mentee:** `/mentee/progress` (own analytics).

## Role flows
- **Admin:** compares clans worst-first, uses the fairness lens to judge fairly, drills into mentee/mentor/program rollups, watches platform activity.
- **Mentor:** the cockpit surfaces at-risk mentees + cohort health daily; generates reports.
- **Mentee:** sees their own progress, streak, and skill growth.

## Rules & edge cases
- **Fairness lens:** absolute progress can understate someone with accepted delays; the credited view adjusts for that — the core "measured fairly" principle.
- Activity active-minutes count only while the tab is visible; sessions are one-per-user-per-day.
- Rollups are periodic snapshots (keyed by entity + period), not live aggregates.

## Related
[Enrollment & Progress](./enrollment-and-progress.md) · [Blockers & Delays](./blockers-and-delays.md) · [AI Integration](./ai-integration.md) (reports/recommendations) · [Programs, Cohorts & Clans](./programs-cohorts-clans.md)
