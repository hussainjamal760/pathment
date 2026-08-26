## Problem Statement

Mentors lack a native way to assign recurring tasks (e.g. daily standups, weekly check-ins, regular coding exercises) to mentees. Currently, they have to manually assign one-off custom tasks week after week, leading to high administrative overhead for mentors and empty schedules for mentees.

## Proposed Solution

1. **Frontend Integration:** Add a "Recurring" task type in the custom task assignment drawer (`AssignTaskDrawer.tsx`). Allow mentors to choose days of the week (using a reusable `MultiDaySelectDropdown`), time, frequency (interval weeks), and starts/ends dates.
2. **Schedule Storage:** Save these configurations as recurring slots in the mentee's `MenteeSchedule` jsonb config (using existing columns).
3. **Background Materialization:** Build a background scheduler (`recurringSlotMaterializer.js`) that automatically scans active schedules and pre-creates (`materializes`) task occurrences for a rolling 14-day horizon.
4. **API Optimization:** 
   - Perform the materialization asynchronously (fire-and-forget) upon slot assignment to avoid API timeouts.
   - Batch query existing tasks in a single select query during materialization and only write updates when fields have actually changed.
5. **Clean UX Notifications:** Dispatch exactly 1 notification to the mentee when a new recurring schedule is assigned, keeping the individual task materializations silent. Strip prefixing from the schedule slot ID to ensure database UUID validation passes.

## Alternatives Considered

1. **Unbounded Occurrence Generation:** Generating slots infinitely into the future. Rejected because it causes database bloat and prevents mentors from modifying schedules dynamically.
2. **Individual Task Notifications:** Notifying the mentee for every single task occurrence. Rejected because assigning a weekdays schedule would immediately spam the user with 10 duplicate alerts.

## Scope

- App area: server / client-interface
- Breaking change: no
- Requires migration/config changes: no

## Acceptance Criteria

- [x] Mentors can select "Recurring" in the Assign Drawer, configure recurrence patterns, and submit.
- [x] Mentee schedule saves the recurring slot configurations.
- [x] Tasks are materialized dynamically in the background for a rolling 14-day window.
- [x] Materializer queries the DB in batches and avoids redundant updates.
- [x] Mentee gets a single in-app notification upon slot assignment.
- [x] Database doesn't throw UUID validation errors.

## Additional Context

Modified Files:
- [AssignTaskDrawer.tsx](file:///home/hussain/pathment/client-interface/components/mentor/AssignTaskDrawer.tsx)
- [page.tsx](file:///home/hussain/pathment/client-interface/app/mentor/schedules/page.tsx)
- [index.ts](file:///home/hussain/pathment/client-interface/components/shared/index.ts)
- [MultiDaySelectDropdown.tsx](file:///home/hussain/pathment/client-interface/components/shared/MultiDaySelectDropdown.tsx)
- [taskService.js](file:///home/hussain/pathment/server/src/services/taskService.js)
- [recurringSlotMaterializer.js](file:///home/hussain/pathment/server/src/services/recurringSlotMaterializer.js)
