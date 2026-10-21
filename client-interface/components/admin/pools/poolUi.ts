import type { PoolBucket, PoolDecision, PoolStatus } from '@/lib/types/pool';

/** Shared look for the selection-pool screens. */
export const field =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-card placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';
export const labelCls = 'block text-sm font-medium text-slate-700 mb-1';
export const primaryBtn =
  'px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50';
export const secondaryBtn =
  'px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-50';
export const pill = 'px-2 py-0.5 rounded-full text-xs font-medium';

export const STATUS_LABEL: Record<PoolStatus, string> = {
  draft: 'Draft', open: 'Open', qualifying: 'Qualifying', reviewing: 'Reviewing', placing: 'Placing', closed: 'Closed',
};
export const STATUS_CLASS: Record<PoolStatus, string> = {
  draft: 'bg-slate-100 text-slate-600', open: 'bg-brand-50 text-brand-700', qualifying: 'bg-brand-50 text-brand-700',
  reviewing: 'bg-amber-100 text-amber-700', placing: 'bg-emerald-100 text-emerald-700', closed: 'bg-slate-100 text-slate-500',
};

export const BUCKET_LABEL: Record<PoolBucket, string> = {
  invite_pending: 'Invite pending', not_started: 'Not started', in_progress: 'In progress', needs_review: 'Needs review',
  changes_requested: 'Changes requested', completed: 'Completed', stalled: 'Stalled', withdrawn: 'Withdrawn', disqualified: 'Disqualified',
};
export const BUCKET_CLASS: Record<PoolBucket, string> = {
  invite_pending: 'bg-slate-100 text-slate-600', not_started: 'bg-slate-100 text-slate-600', in_progress: 'bg-brand-50 text-brand-700',
  needs_review: 'bg-amber-100 text-amber-700', changes_requested: 'bg-amber-100 text-amber-700', completed: 'bg-emerald-100 text-emerald-700',
  stalled: 'bg-red-50 text-red-600', withdrawn: 'bg-slate-100 text-slate-500', disqualified: 'bg-red-50 text-red-600',
};

export const DECISION_LABEL: Record<PoolDecision, string> = {
  selected: 'Selected', waitlisted: 'Waitlisted', not_selected: 'Not selected', withdrawn: 'Withdrawn', disqualified: 'Disqualified',
};
export const DECISION_CLASS: Record<PoolDecision, string> = {
  selected: 'bg-emerald-100 text-emerald-700', waitlisted: 'bg-amber-100 text-amber-700', not_selected: 'bg-slate-100 text-slate-500',
  withdrawn: 'bg-slate-100 text-slate-500', disqualified: 'bg-red-50 text-red-600',
};

export const apiError = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
