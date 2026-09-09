/**
 * Every query key in one place.
 *
 * Keys are hierarchical, so a prefix invalidates everything beneath it:
 * `invalidateQueries({ queryKey: qk.mentee.all })` clears every mentee query,
 * while `qk.mentee.profile(id)` clears one. Define keys here rather than inline
 * so invalidation targets are discoverable and typos cannot silently create a
 * second cache entry.
 */
export const qk = {
  auth: {
    permissions: ['auth', 'permissions'] as const,
    twoFactor: ['auth', '2fa-status'] as const,
  },

  profile: {
    appearance: ['profile', 'appearance'] as const,
  },

  clan: {
    all: ['clan'] as const,
    memberships: ['clan', 'memberships'] as const,
    detail: (clanId: string) => ['clan', 'detail', clanId] as const,
  },

  changelog: {
    feed: (role: string) => ['changelog', 'feed', role] as const,
  },

  messaging: {
    all: ['messaging'] as const,
    notifications: ['messaging', 'notifications'] as const,
    conversations: (archived: boolean) => ['messaging', 'conversations', archived] as const,
  },

  mentor: {
    all: ['mentor'] as const,
    cohort: ['mentor', 'cohort'] as const,
    approvalsCount: ['mentor', 'approvals-count'] as const,
    mentees: ['mentor', 'mentees'] as const,
    programs: ['mentor', 'programs'] as const,
    programDetail: (programId: string) => ['mentor', 'program', programId] as const,
    roadmaps: ['mentor', 'roadmaps'] as const,
    tracks: (menteeId: string) => ['mentor', 'tracks', menteeId] as const,
    library: ['mentor', 'library'] as const,
    rewards: ['mentor', 'rewards'] as const,
    scheduleTemplates: ['mentor', 'schedule-templates'] as const,
    feedbackSnippets: ['mentor', 'feedback-snippets'] as const,
    promotions: ['mentor', 'promotions'] as const,
    transfersConfig: ['mentor', 'transfers-config'] as const,
  },

  mentee: {
    all: ['mentee'] as const,
    profile: (menteeId: string) => ['mentee', 'profile', menteeId] as const,
    activity: (menteeId: string, days: number) => ['mentee', 'activity', menteeId, days] as const,
    tasks: (menteeId: string) => ['mentee', 'tasks', menteeId] as const,
    enrollments: (menteeId: string) => ['mentee', 'enrollments', menteeId] as const,
    matches: (mentorId: string, menteeId: string) => ['mentee', 'matches', mentorId, menteeId] as const,
    schedule: (menteeId: string) => ['mentee', 'schedule', menteeId] as const,
  },

  me: {
    activity: (days: number) => ['me', 'activity', days] as const,
    programs: ['me', 'programs'] as const,
    roadmaps: ['me', 'roadmaps'] as const,
    progress: ['me', 'progress'] as const,
  },

  admin: {
    all: ['admin'] as const,
    dashboard: ['admin', 'dashboard'] as const,
    clans: ['admin', 'clans'] as const,
    programs: ['admin', 'programs'] as const,
    mentors: ['admin', 'mentors'] as const,
    mentees: ['admin', 'mentees'] as const,
  },

  announcements: ['announcements'] as const,
} as const;
