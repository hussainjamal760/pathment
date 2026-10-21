'use client';

import { History, Loader2 } from 'lucide-react';
import { qk, useApiQuery } from '@/lib/query';
import { poolsApi } from '@/lib/services/pools-api';
import type { PoolHistory } from '@/lib/types/pool';

const ACTION_LABEL: Record<string, string> = {
  POOL_CREATED: 'Created the pool',
  POOL_UPDATED: 'Changed the settings',
  POOL_STATUS_CHANGED: 'Moved the pool',
  POOL_MEMBERS_IMPORTED: 'Added candidates',
  POOL_MEMBER_REMOVED: 'Removed a candidate',
  POOL_WORK_ASSIGNED: 'Assigned work',
  POOL_SELECTION_CONFIRMED: 'Confirmed the selection',
  POOL_DECISION_CHANGED: 'Changed an outcome',
  POOL_PLACEMENT_RUN: 'Placed candidates',
};

/** Who did what, and every shortlist the system proposed. Kept so a decision can be explained later. */
export function HistoryTab({ poolId }: { poolId: string }) {
  const { data, loading } = useApiQuery<PoolHistory>({
    queryKey: qk.admin.poolHistory(poolId),
    queryFn: async () => (await poolsApi.history(poolId))?.data,
    errorMessage: 'Failed to load the history',
  });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  if (!data?.events.length) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
        <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">Nothing has happened yet</p>
      </div>
    );
  }

  const detail = (e: PoolHistory['events'][number]) => {
    const d = e.details || {};
    const parts = [
      e.subject,
      typeof d.status === 'string' ? d.status : null,
      typeof d.decision === 'string' ? d.decision.replace('_', ' ') : null,
      typeof d.reason === 'string' ? `“${d.reason}”` : null,
      typeof d.assigned === 'number' ? `${d.assigned} assigned` : null,
      typeof d.added === 'number' ? `${d.added} added` : null,
      typeof d.placed === 'number' ? `${d.placed} placed` : null,
      Array.isArray(d.overrides) && d.overrides.length ? `${d.overrides.length} manual change(s)` : null,
    ];
    return parts.filter(Boolean).join(' · ');
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {data.events.map((e) => (
          <div key={e.id} className="p-3 flex items-start gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-slate-900">{ACTION_LABEL[e.action] || e.action}</p>
              {detail(e) && <p className="text-xs text-slate-500 mt-0.5">{detail(e)}</p>}
            </div>
            <div className="text-right text-xs text-slate-400 shrink-0">
              <p>{e.actor}</p>
              <p>{new Date(e.at).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
      {data.snapshots.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">Shortlists proposed</h3>
          <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {data.snapshots.map((s) => (
              <div key={s.generatedAt} className="p-3 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-slate-900 font-medium">{new Date(s.generatedAt).toLocaleString()}</span>
                <span>Scoring v{s.policyVersion}</span>
                <span>Top {s.quota} of {s.entries.length} ranked</span>
                {s.blockers.pendingReview.length > 0 && <span>{s.blockers.pendingReview.length} unreviewed</span>}
                {s.blockers.tieAtCutoff.length > 0 && <span>{s.blockers.tieAtCutoff.length} tied at cutoff</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
