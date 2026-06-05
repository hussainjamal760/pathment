/**
 * Mirror of server/src/config/notificationMatrix.js → EMAIL_PREFERENCE_CATEGORIES.
 * The emailable, non-transactional notification categories a user can toggle.
 * Each `key` is the preferenceKey the orchestrator checks in `emailNotifications`.
 * Keep in sync with the server.
 */
export interface EmailCategory { group: string; key: string; label: string }

export const EMAIL_PREFERENCE_CATEGORIES: EmailCategory[] = [
  { group: 'Tasks', key: 'task_assigned', label: 'A task is assigned to me' },
  { group: 'Tasks', key: 'task_submitted', label: 'A mentee submits a task' },
  { group: 'Tasks', key: 'deadline_approaching', label: 'A task deadline is approaching' },
  { group: 'Tasks', key: 'deadline_passed', label: 'A task deadline has passed' },
  { group: 'Tasks', key: 'extension_requested', label: 'An extension is requested' },
  { group: 'Tasks', key: 'extension_handled', label: 'My extension request is handled' },
  { group: 'Feedback', key: 'submission_reviewed', label: 'My submission is reviewed' },
  { group: 'Feedback', key: 'feedback_sent', label: 'I receive feedback' },
  { group: 'Program', key: 'enrollment_updates', label: 'Enrollment updates' },
  { group: 'Program', key: 'mentor_assignment', label: 'A mentor is assigned' },
  { group: 'Program', key: 'program_updates', label: 'Program updates' },
  { group: 'Program', key: 'meeting_cancelled', label: 'A 1:1 is cancelled' },
  { group: 'Milestones', key: 'completion_ready_for_signoff', label: 'Completion is ready for sign-off' },
  { group: 'Milestones', key: 'program_completed', label: 'A program is completed' },
  { group: 'Digests', key: 'weekly_progress_report', label: 'Weekly progress report' },
];

export const EMAIL_CATEGORY_GROUPS = Array.from(new Set(EMAIL_PREFERENCE_CATEGORIES.map((c) => c.group)));
