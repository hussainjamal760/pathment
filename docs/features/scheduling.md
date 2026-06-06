# Scheduling & 1:1s

**What it is:** mentor availability + 1:1 meeting booking + post-meeting notes, plus reusable
**schedule templates** that shape a mentee's weekly cadence.

**Why it exists:** consistent 1:1s are a core mentoring responsibility. This lets mentors
publish open times, mentees book them, and both keep a record of what was discussed.

## Data model
`AvailabilitySlot` (mentorId, date, time, durationMins, taken, takenBy). `ScheduledMeeting`
(mentorId, menteeId, slotId?, kind `1:1|standup|review|pairing`, status
`scheduled|done|cancelled`, cancellationReason). `MeetingNote` (summary, sentiment, issues,
nextSteps). `ScheduleTemplate` (org/mentor `blocks`) + `MenteeSchedule` (per-mentee slot
config). See [DATABASE.md §10](../DATABASE.md).

## Backend
- **Meetings (`/api/meetings`):** `POST /availability` + `GET /availability/mine` + `DELETE /availability/:id` (mentor publishes slots), `GET /bookable` + `POST /book` (mentee books), `GET /` (my meetings), `PATCH /:id/status` (mark done / cancel with reason).
- **Schedules (`/api/schedules`):** **org** templates `/org` (`program.manage`) - the shared library; **mentor** templates `/templates` (create/import/assign); per-mentee `/me`, `/mentee/:id`, slot edits. `schedulingService` powers availability + meetings.

## Frontend
- **Mentor:** `/mentor/schedules` (publish availability, manage templates, assign mentee schedules); meeting notes captured per 1:1.
- **Mentee:** `/mentee/meetings` ("My Mentor") - see the mentor's open times, book a 1:1, view upcoming.
- **Admin:** `/admin/schedules` (org schedule templates).

## Role flows
- **Mentor:** publishes weekly availability slots, assigns a schedule template to mentees, runs 1:1s and writes a note (summary + sentiment + next steps). Can cancel with a reason (the mentee is notified).
- **Mentee:** opens "My Mentor," picks an open slot, books it; sees their cadence.
- **Admin:** maintains org schedule templates mentors import.

## Timezones (migration 051)
A US-hosted server with PK/IN users means "2:00 PM" is meaningless without a zone. So:
- Slots & meetings store a true UTC instant **`starts_at`** + the authoring **`timezone`**
  (computed server-side from the mentor's wall-clock via `utils/timezone.js`, DST-correct).
  Schedule templates / mentee schedules carry a `timezone` for their recurring blocks.
- The client renders every instant in the **viewer's** zone with a label (`lib/utils/datetime.ts`,
  e.g. "2:00 PM PKT"); the user's zone is captured once on login (`/profile/detect-timezone`).
- Task **deadlines** are stored as end-of-day in the *mentee's* timezone (not UTC midnight).
- Rule of thumb: store the UTC instant, render local. See article 17.

## Rules & edge cases
- A slot is single-use (`taken`/`takenBy`); booking marks it taken and creates a meeting.
- Cancelling a meeting requires a reason, which is shown to the other party + emailed (see [Notifications](./notifications-and-email.md) - `meeting_cancelled`).
- Availability slots are de-duplicated per (mentor, date, time).

## Related
[Programs, Cohorts & Clans](./programs-cohorts-clans.md) · [Notifications & Email](./notifications-and-email.md) · [Analytics & Insights](./analytics-and-insights.md)
