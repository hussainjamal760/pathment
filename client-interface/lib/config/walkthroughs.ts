import type { UserRole } from '@/lib/types';

export interface TourStep {
  /** CSS selector for the element to spotlight, or null for a centered card. */
  target: string | null;
  title: string;
  body: string;
}

export const TOUR_STORAGE_PREFIX = 'pathment-tour-seen';
export const TOUR_EVENT = 'pathment:start-tour';

// Nav links are targeted by href (no extra markup needed); the bell + help use
// a data-tour attribute. Steps whose target isn't on screen are skipped safely.
const COMMON_TAIL = (role: UserRole): TourStep[] => [
  { target: '[data-tour="notifications"]', title: 'Notifications', body: 'Real-time updates — new tasks, messages, blockers and reviews — show up here the moment they happen.' },
  { target: `a[href="/${role}/settings"]`, title: 'Settings & themes', body: 'Edit your profile and skills, and pick your color vibe + light/dark mode in the Appearance tab.' },
  { target: null, title: "You're all set 🎉", body: 'That’s the quick tour. You can replay it anytime from the “?” button at the top of the sidebar.' },
];

export const WALKTHROUGHS: Record<UserRole, TourStep[]> = {
  mentor: [
    { target: null, title: 'Welcome to Pathment 👋', body: 'A quick 60-second tour of your mentor workspace. You can skip anytime — and replay it later.' },
    { target: 'a[href="/mentor/dashboard"]', title: 'Cockpit', body: 'Your home base. See who needs attention today, your cohort’s health, and jump straight in.' },
    { target: 'a[href="/mentor/mentees"]', title: 'My Mentees', body: 'Everyone you mentor in one place — filter by clan, search by name, and open any mentee’s profile.' },
    { target: 'a[href="/mentor/approvals"]', title: 'Approvals', body: 'Review work your mentees submit and leave feedback. The count shows what’s waiting on you.' },
    { target: 'a[href="/mentor/review"]', title: 'Cohort Review', body: 'Run your weekly review and assign tasks or whole roadmaps to one or many mentees.' },
    ...COMMON_TAIL('mentor'),
  ],
  mentee: [
    { target: null, title: 'Welcome to Pathment 👋', body: 'A quick tour of your learning space. You can skip anytime — and replay it later.' },
    { target: 'a[href="/mentee/dashboard"]', title: 'This Week', body: 'Your single most important next action, front and center — so you always know what to do next.' },
    { target: 'a[href="/mentee/tasks"]', title: 'My Tasks', body: 'Everything assigned to you. Open a task and submit your work right here.' },
    { target: 'a[href="/mentee/meetings"]', title: 'My Mentor', body: 'Book 1:1s from your mentor’s open times and keep in touch.' },
    { target: 'a[href="/mentee/blockers"]', title: 'Blockers', body: 'Stuck on something? Log a blocker — it’s counted fairly toward your progress, not against you.' },
    ...COMMON_TAIL('mentee'),
  ],
  admin: [
    { target: null, title: 'Welcome to Pathment 👋', body: 'A quick tour of your admin console. You can skip anytime — and replay it later.' },
    { target: 'a[href="/admin/dashboard"]', title: 'Dashboard', body: 'Org-wide health at a glance — programs, clans, and who’s at risk.' },
    { target: 'a[href="/admin/insights"]', title: 'Insights', body: 'Compare clans worst-first and see the fairness lens (absolute vs. credited progress).' },
    { target: 'a[href="/admin/enrollment/overview"]', title: 'Enrollments', body: 'Place mentees into programs and track every enrollment’s status.' },
    { target: 'a[href="/admin/clans"]', title: 'Clans', body: 'Create and manage clans — the mentor-led groups mentees belong to.' },
    ...COMMON_TAIL('admin'),
  ],
};
