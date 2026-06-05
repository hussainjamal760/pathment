# Blockers & Delays

**What it is:** the "friction" inputs that make progress **fair**. A mentee can log a
**blocker** (something stuck) or a **delay** (external reason they fell behind); when a
mentor **accepts** a delay, it credits the mentee so they aren't punished for things outside
their control.

**Why it exists:** raw "% of tasks done" is unfair — someone hit by illness or a power
outage looks the same as someone who slacked. Accepted delays separate "couldn't" from
"didn't," feeding a fairer *relative* progress used in insights.

## Data model
`Blocker` (menteeId, assignedTaskId?, title, category technical/knowledge/access/personal,
severity, status `open|resolved`). `DelayEvent` (menteeId, assignedTaskId?, reason, kind
job/health/connectivity/…, days, `accepted`, category external/scope/avoidance,
`aiRationale`). See [DATABASE.md §7](../DATABASE.md).

## Backend
- **`/api/blockers` + `/api/delays`** (mounted via the friction router): `GET/POST /blockers`, `PATCH /blockers/:id/resolve`; `GET/POST /delays`, `PATCH /delays/:id/accept` (mentor/admin).
- Accepted delays contribute "credited" days that the **fairness lens** in [Analytics](./analytics-and-insights.md) uses to compute *relative* progress (absolute vs. credited).

## Frontend
- **Mentee:** `/mentee/blockers` — log a blocker/delay with reason + severity.
- **Mentor:** at-risk + cohort review surfaces blockers/delays; the mentor **accepts** genuine delays. `/mentor/at-risk`.
- **Admin:** insights show the fairness impact org-wide.

## Role flows
- **Mentee:** hits a wall → logs a blocker ("stuck on X") or a delay ("power was out 3 days"). It's a signal, not a penalty.
- **Mentor:** sees the friction, reaches out early, and **accepts** real delays so the mentee's relative progress reflects reality; resolves blockers.
- **Admin:** uses the fairness lens to compare clans/mentees on credited (not just absolute) progress.

## Rules & edge cases
- A delay only credits the mentee once a mentor **accepts** it (with a category — external/scope/avoidance).
- Blockers/delays can attach to a specific assigned task or stand alone.
- This is the data behind "measured fairly" in the [Mentor Spec](./knowledge-library-and-mentor-spec.md).

## Related
[Enrollment & Progress](./enrollment-and-progress.md) · [Analytics & Insights](./analytics-and-insights.md) (fairness lens) · [Roadmaps & Tasks](./roadmaps-and-tasks.md)
