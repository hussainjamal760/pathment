const NOTIFICATION_EVENTS = {
  TASK_SUBMITTED: 'task_submitted',
  SUBMISSION_REVIEWED: 'submission_reviewed',
  FEEDBACK_SENT: 'feedback_sent',
  TASK_ASSIGNED: 'task_assigned',
  ROADMAP_ADVANCED: 'roadmap_advanced',
  TASK_DEADLINE_APPROACHING: 'task_deadline_approaching',
  CHAT_MESSAGE_NEW: 'chat_message_new',
  MENTEE_ENROLLED: 'mentee_enrolled',
  MENTOR_ASSIGNED: 'mentor_assigned',
  PROGRAM_UPDATED: 'program_updated',
  SUBMISSION_DEADLINE_PASSED: 'submission_deadline_passed',
  ACCOUNT_CREATED_WELCOME: 'account_created_welcome',
  PASSWORD_RESET: 'password_reset',
  WEEKLY_PROGRESS_REPORT: 'weekly_progress_report',
  EXTENSION_REQUESTED: 'extension_requested',
EXTENSION_HANDLED: 'extension_handled',
  MENTOR_NUDGE: 'mentor_nudge',
  COMMUNITY_MENTION: 'community_mention',
  COMMUNITY_REPLY: 'community_reply',
  COMMUNITY_KUDOS: 'community_kudos',
  COMMUNITY_ANSWER_ACCEPTED: 'community_answer_accepted',
  COMPLETION_READY_FOR_SIGNOFF: 'completion_ready_for_signoff',
  PROGRAM_COMPLETED: 'program_completed',
  MENTOR_FEEDBACK_REQUESTED: 'mentor_feedback_requested',
  MEETING_CANCELLED: 'meeting_cancelled',
  MEETING_BOOKED: 'meeting_booked',
  CROSS_CLAN_ASSIGNED: 'cross_clan_assigned',
  NEW_MENTEE_IN_CLAN: 'new_mentee_in_clan',
  MENTEE_TRANSFER_REQUESTED: 'mentee_transfer_requested',
  MENTEE_TRANSFER_DECIDED: 'mentee_transfer_decided',
  PROMOTION_NOMINATED: 'promotion_nominated',
  REVIEW_UNLOCK_REQUESTED: 'review_unlock_requested',
  REVIEW_UNLOCK_HANDLED: 'review_unlock_handled',
  MENTEE_PAUSE_SUGGESTED: 'mentee_pause_suggested',
  MENTEE_PAUSED: 'mentee_paused',
  MENTEE_REENGAGE: 'mentee_reengage',
  MENTEE_RETURNED: 'mentee_returned',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  FEEDBACK_STATUS_UPDATED: 'feedback_status_updated',
  APPLICATION_RECEIVED: 'application_received',
  APPLICATION_CAPACITY_REACHED: 'application_capacity_reached',
  REVIEW_SCHEDULED: 'review_scheduled',
  REVIEW_REMINDER: 'review_reminder',
  ADMIN_MEETING_INVITE: 'admin_meeting_invite',
  ADMIN_MEETING_REMINDER: 'admin_meeting_reminder',
  CERTIFICATE_AWARDED: 'certificate_awarded'
};

const NOTIFICATION_AUDIENCES = ['mentor', 'mentee', 'admin', 'any'];

const NOTIFICATION_MATRIX = {
  [NOTIFICATION_EVENTS.APPLICATION_RECEIVED]: {
    type: 'intake',
    audience: 'admin',
    preferenceKey: 'application_received',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.APPLICATION_CAPACITY_REACHED]: {
    type: 'intake',
    audience: 'admin',
    preferenceKey: 'application_capacity_reached',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.TASK_SUBMITTED]: {
    type: 'task',
    audience: 'mentor',
    preferenceKey: 'task_submitted',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.SUBMISSION_REVIEWED]: {
    type: 'feedback',
    audience: 'mentee',
    preferenceKey: 'submission_reviewed',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.FEEDBACK_SENT]: {
    type: 'feedback',
    audience: 'mentee',
    preferenceKey: 'feedback_sent',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.TASK_ASSIGNED]: {
    type: 'task',
    audience: 'mentee',
    preferenceKey: 'task_assigned',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.ROADMAP_ADVANCED]: {
    type: 'task',
    audience: 'mentee',
    preferenceKey: 'task_assigned',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.TASK_DEADLINE_APPROACHING]: {
    type: 'task',
    audience: 'mentee',
    preferenceKey: 'deadline_approaching',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.CHAT_MESSAGE_NEW]: {
    type: 'message',
    audience: 'any',
    preferenceKey: 'message_received',
    channels: { inApp: true, email: false, chat: true }
  },
  [NOTIFICATION_EVENTS.MENTEE_ENROLLED]: {
    type: 'system',
    audience: 'mentor',
    preferenceKey: 'enrollment_updates',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTOR_ASSIGNED]: {
    type: 'system',
    audience: 'mentee',
    preferenceKey: 'mentor_assignment',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.PROGRAM_UPDATED]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'program_updates',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.REVIEW_UNLOCK_REQUESTED]: {
    type: 'system',
    audience: 'admin',
    preferenceKey: 'review_unlock_requested',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.REVIEW_UNLOCK_HANDLED]: {
    type: 'system',
    audience: 'mentor',
    preferenceKey: 'review_unlock_handled',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.SUBMISSION_DEADLINE_PASSED]: {
    type: 'task',
    audience: 'mentee',
    preferenceKey: 'deadline_passed',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.ACCOUNT_CREATED_WELCOME]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'account_welcome',
    channels: { inApp: false, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.PASSWORD_RESET]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'password_reset',
    channels: { inApp: false, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.WEEKLY_PROGRESS_REPORT]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'weekly_progress_report',
    channels: { inApp: false, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.EXTENSION_REQUESTED]: {
  type: 'task',
  audience: 'mentor',
  preferenceKey: 'extension_requested',
  channels: { inApp: true, email: true, chat: false }
},
[NOTIFICATION_EVENTS.EXTENSION_HANDLED]: {
  type: 'task',
  audience: 'mentee',
  preferenceKey: 'extension_handled',
  channels: { inApp: true, email: true, chat: false }
},
  [NOTIFICATION_EVENTS.MENTOR_NUDGE]: {
    type: 'system',
    audience: 'mentee',
    preferenceKey: 'mentor_nudge',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMMUNITY_MENTION]: {
    type: 'message',
    audience: 'any',
    preferenceKey: 'community_mention',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMMUNITY_REPLY]: {
    type: 'message',
    audience: 'any',
    preferenceKey: 'community_reply',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMMUNITY_KUDOS]: {
    type: 'message',
    audience: 'any',
    preferenceKey: 'community_kudos',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMMUNITY_ANSWER_ACCEPTED]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'community_answer_accepted',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMPLETION_READY_FOR_SIGNOFF]: {
    type: 'milestone',
    audience: 'mentor',
    preferenceKey: 'completion_ready_for_signoff',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.PROGRAM_COMPLETED]: {
    type: 'milestone',
    audience: 'any',
    preferenceKey: 'program_completed',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTOR_FEEDBACK_REQUESTED]: {
    type: 'feedback',
    audience: 'mentee',
    preferenceKey: 'mentor_feedback_requested',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.MEETING_CANCELLED]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'meeting_cancelled',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MEETING_BOOKED]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'meeting_booked',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.CROSS_CLAN_ASSIGNED]: {
    type: 'system',
    audience: 'mentor',
    preferenceKey: 'cross_clan_assigned',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.NEW_MENTEE_IN_CLAN]: {
    type: 'system',
    audience: 'mentor',
    preferenceKey: 'new_mentee_in_clan',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTEE_TRANSFER_REQUESTED]: {
    type: 'system',
    audience: 'mentor',
    preferenceKey: 'mentee_transfer_requested',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTEE_TRANSFER_DECIDED]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'mentee_transfer_decided',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.PROMOTION_NOMINATED]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'promotion_nominated',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTEE_PAUSE_SUGGESTED]: {
    type: 'system',
    audience: 'mentor',
    preferenceKey: 'mentee_pause_suggested',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTEE_PAUSED]: {
    type: 'system',
    audience: 'mentee',
    preferenceKey: 'mentee_paused',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTEE_REENGAGE]: {
    type: 'system',
    audience: 'mentee',
    preferenceKey: 'mentee_reengage',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTEE_RETURNED]: {
    type: 'system',
    audience: 'mentor',
    preferenceKey: 'mentee_returned',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.FEEDBACK_SUBMITTED]: {
    type: 'system',
    audience: 'admin',
    preferenceKey: 'feedback_submitted',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.FEEDBACK_STATUS_UPDATED]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'feedback_status_updated',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.REVIEW_SCHEDULED]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'review_scheduled',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.REVIEW_REMINDER]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'review_reminder',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.ADMIN_MEETING_INVITE]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'admin_meeting_invite',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.ADMIN_MEETING_REMINDER]: {
    type: 'system',
    audience: 'any',
    preferenceKey: 'admin_meeting_reminder',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.CERTIFICATE_AWARDED]: {
    type: 'system',
    audience: 'mentee',
    preferenceKey: 'certificate_awarded',
    channels: { inApp: true, email: false, chat: false }
  }
};

function deriveAudienceFromUrl(actionUrl) {
  if (!actionUrl || typeof actionUrl !== 'string') return null;
  const seg = actionUrl.split('?')[0].split('/').filter(Boolean)[0];
  if (seg === 'mentor' || seg === 'mentee' || seg === 'admin') return seg;
  return null;
}

function resolveAudience(eventKey, actionUrl) {
  const fromUrl = deriveAudienceFromUrl(actionUrl);
  if (fromUrl) return fromUrl;
  const declared = NOTIFICATION_MATRIX[eventKey] && NOTIFICATION_MATRIX[eventKey].audience;
  return declared && NOTIFICATION_AUDIENCES.includes(declared) ? declared : 'any';
}

const EMAIL_PREFERENCE_CATEGORIES = [
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
  { group: 'Program', key: 'meeting_booked', label: 'A 1:1 is booked' },
  { group: 'Program', key: 'meeting_cancelled', label: 'A 1:1 is cancelled' },
  { group: 'Program', key: 'cross_clan_assigned', label: 'I\'m asked to cover or help another clan' },
  { group: 'Program', key: 'new_mentee_in_clan', label: 'A new mentee joins my clan' },
  { group: 'Program', key: 'promotion_nominated', label: 'A mentee is nominated for promotion (admins)' },
  { group: 'Milestones', key: 'completion_ready_for_signoff', label: 'Completion is ready for sign-off' },
  { group: 'Milestones', key: 'program_completed', label: 'A program is completed' },
  { group: 'Digests', key: 'weekly_progress_report', label: 'Weekly progress report' },
  { group: 'Program', key: 'mentee_returned', label: 'A paused mentee returns to my clan' },
  { group: 'Program', key: 'mentee_reengage', label: 'Reminders to come back when I\'m paused' },
  { group: 'Program', key: 'feedback_status_updated', label: 'Updates on my feedback / bug reports' }
];

module.exports = {
  NOTIFICATION_EVENTS,
  NOTIFICATION_MATRIX,
  NOTIFICATION_AUDIENCES,
  EMAIL_PREFERENCE_CATEGORIES,
  deriveAudienceFromUrl,
  resolveAudience
};
