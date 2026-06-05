'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ClipboardCheck, CheckCircle2, Clock, Loader2, ChevronRight,
} from 'lucide-react';
import { useMentorApprovals, type ApprovalItem } from '@/lib/hooks/mentor';
import { ReviewDrawer } from '@/components/mentor/ReviewDrawer';

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MentorApprovals() {
  const { queue, loading, error, refetch, bulkApprove } = useMentorApprovals();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<ApprovalItem | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const onTime = useMemo(() => queue.filter((q) => !q.isLate), [queue]);
  const selectedOnTime = useMemo(
    () => [...selected].filter((id) => onTime.some((q) => q.submissionId === id)),
    [selected, onTime]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAllOnTime = () => {
    if (selectedOnTime.length === onTime.length) setSelected(new Set());
    else setSelected(new Set(onTime.map((q) => q.submissionId)));
  };

  const runBulk = async () => {
    if (!selectedOnTime.length) return;
    try {
      setBulkBusy(true);
      await bulkApprove(selectedOnTime);
      setSelected(new Set());
      toast.success(`Approved ${selectedOnTime.length} submission${selectedOnTime.length > 1 ? 's' : ''}`);
    } catch {
      toast.error('Bulk approval failed');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Approvals</h1>
          <p className="text-slate-600">
            {loading ? 'Loading…' : `${queue.length} submission${queue.length === 1 ? '' : 's'} awaiting your review`}
          </p>
        </div>
        {onTime.length > 0 && (
          <button
            onClick={runBulk}
            disabled={bulkBusy || selectedOnTime.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 shrink-0"
          >
            {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            Approve selected{selectedOnTime.length > 0 ? ` (${selectedOnTime.length})` : ''}
          </button>
        )}
      </div>

      {/* Select-all bar */}
      {onTime.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <button onClick={selectAllOnTime} className="inline-flex items-center gap-2 hover:text-slate-700">
            <input
              type="checkbox"
              readOnly
              checked={selectedOnTime.length === onTime.length && onTime.length > 0}
              className="w-4 h-4 rounded border-slate-300 text-brand-600"
            />
            Select all on-time ({onTime.length})
          </button>
          <span className="text-slate-300">·</span>
          <span>Late work opens a full review.</span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : queue.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
          <p className="text-slate-600">All caught up — nothing waiting on you.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {queue.map((item) => (
            <div key={item.submissionId} className="flex items-center gap-4 px-5 py-4">
              {!item.isLate ? (
                <input
                  type="checkbox"
                  checked={selected.has(item.submissionId)}
                  onChange={() => toggle(item.submissionId)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 shrink-0"
                />
              ) : (
                <span className="w-4 shrink-0" />
              )}

              <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-brand-700 text-xs font-medium">{item.mentee?.avatar}</span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                  <span>{item.mentee?.name}</span>
                  {item.type && (<><span className="text-slate-300">·</span><span className="capitalize">{item.type}</span></>)}
                  <span className="text-slate-300">·</span>
                  <span>{timeAgo(item.submittedAt)}</span>
                  {item.isLate && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
                      <Clock className="w-3 h-3" />late
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setReviewing(item)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700 shrink-0"
              >
                Review <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {reviewing && (
        <ReviewDrawer
          item={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={() => { setSelected(new Set()); refetch(); }}
        />
      )}
    </div>
  );
}
