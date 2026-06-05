/**
 * Client mirror of the server permission vocabulary
 * (server/src/config/permissions.js). Use these constants with useCan() /
 * <PermissionGuard> to show or hide UI. NOTE: this is UX only - the server is
 * always the source of truth and re-checks every request.
 */
export const PERMISSIONS = {
  PROGRAM_CREATE: 'program.create',
  PROGRAM_MANAGE: 'program.manage',
  PROGRAM_PUBLISH: 'program.publish',
  COHORT_MANAGE: 'cohort.manage',
  ROADMAP_AUTHOR: 'roadmap.author',
  ROADMAP_PUBLISH_LOCAL: 'roadmap.publish_local',
  INTAKE_MANAGE: 'intake.manage',
  ASSESSMENT_AUTHOR: 'assessment.author',
  INVITE_CREATE: 'invite.create',
  CLAN_CREATE: 'clan.create',
  CLAN_MANAGE_MEMBERS: 'clan.manage_members',
  MENTEE_VIEW: 'mentee.view',
  MENTEE_MANAGE: 'mentee.manage',
  USER_MANAGE: 'user.manage',
  TASK_ASSIGN: 'task.assign',
  TASK_REVIEW: 'task.review',
  COMMUNITY_POST: 'community.post',
  COMMUNITY_MODERATE: 'community.moderate',
  GAMIFICATION_MANAGE: 'gamification.manage',
  ANALYTICS_VIEW: 'analytics.view',
  ACCESS_MANAGE: 'access.manage',
  SYSTEM_SETTINGS: 'system.settings',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
