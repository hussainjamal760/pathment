'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ClipboardCheck, CheckCircle2, Clock, Loader2, ChevronRight, CalendarClock, Check, X,
} from 'lucide-react';
import { useMentorApprovals, type ApprovalItem } from '@/lib/hooks/mentor';
import { ReviewDrawer } from '@/components/mentor/ReviewDrawer';
import { todayInZone, dateInZone, addDaysToDateStr, zoneLabel } from '@/lib/utils/datetime';

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

type Tab = 'review' | 'extensions';

export default function MentorApprovals() {
  const { queue, loading, error, refetch, bulkApprove, handleExtension } = useMentorApprovals();
  const [tab, setTab] = useState<Tab>('review');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<ApprovalItem | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [extBusy, setExtBusy] = useState<string | null>(null);
  // Mentor-chosen new due date per extension request (YYYY-MM-DD).
  const [extDates, setExtDates] = useState<Record<string, string>>({});

  // A deadline is the MENTEE's calendar day — compute "today" and the current
  // due date in THEIR timezone (not UTC / the mentor's browser) so the date the
  // mentor picks matches what the mentee experiences and what the server anchors.
  const todayStr = (item: ApprovalItem) => todayInZone(item.menteeTimezone || undefined);
  const suggestedDate = (item: ApprovalItem) => {
    const tz = item.menteeTimezone || undefined;
    const today = todayInZone(tz);
    const dueStr = item.dueDate ? dateInZone(item.dueDate, tz) : '';
    // Start from the later of today / current due (so it's always in the future
    // even when overdue), then add the requested days.
    const base = dueStr && dueStr > today ? dueStr : today;
    return addDaysToDateStr(base, item.extensionDays || 3);
  };

  // Split the queue: work submissions to review vs pending extension requests.
  const reviewItems = useMemo(() => queue.filter((q) => !q.isExtensionRequest), [queue]);
  const extensionItems = useMemo(() => queue.filter((q) => q.isExtensionRequest), [queue]);

  const onTime = useMemo(() => reviewItems.filter((q) => !q.isLate), [reviewItems]);
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

  const decideExtension = async (item: ApprovalItem, approved: boolean) => {
    const newDate = approved ? (extDates[item.submissionId] || suggestedDate(item)) : undefined;
    try {
      setExtBusy(item.submissionId);
      await handleExtension(item.submissionId, approved, newDate);
      toast.success(
        approved
          ? `Extension approved — new due date ${new Date(`${newDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : 'Extension declined'
      );
    } catch {
      toast.error('Could not update the extension request');
    } finally {
      setExtBusy(null);
    }
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'review', label: 'To review', count: reviewItems.length },
    { key: 'extensions', label: 'Extension requests', count: extensionItems.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Approvals</h1>
          <p className="text-slate-600">
            {loading
              ? 'Loading…'
              : `${reviewItems.length} submission${reviewItems.length === 1 ? '' : 's'} to review` +
                (extensionItems.length ? ` · ${extensionItems.length} extension request${extensionItems.length === 1 ? '' : 's'}` : '')}
          </p>
        </div>
        {tab === 'review' && onTime.length > 0 && (
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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs ${
                t.key === 'extensions' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading / error */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : tab === 'review' ? (
        /* ── To review ───────────────────────────────────────────── */
        <>
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

          {reviewItems.length === 0 ? (
            <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
              <CheckCircle2 className="w-12 h-12 text-brand-300 mx-auto mb-3" />
              <p className="text-slate-600">All caught up - nothing waiting on you.</p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {reviewItems.map((item) => (
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
        </>
      ) : (
        /* ── Extension requests ──────────────────────────────────── */
        extensionItems.length === 0 ? (
          <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
            <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No extension requests right now.</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {extensionItems.map((item) => {
              const busy = extBusy === item.submissionId;
              return (
                <div key={item.submissionId} className="flex items-start gap-4 px-5 py-4">
                  <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-amber-700 text-xs font-medium">{item.mentee?.avatar}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs">
                        <CalendarClock className="w-3 h-3" />
                        {item.extensionDays ? `+${item.extensionDays} day${item.extensionDays === 1 ? '' : 's'}` : 'extension'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      <span>{item.mentee?.name}</span>
                      <span className="text-slate-300">·</span>
                      <span>{timeAgo(item.submittedAt)}</span>
                      {item.isLate && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
                          <Clock className="w-3 h-3" />late
                        </span>
                      )}
                    </div>
                    {item.extensionReason && (
                      <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        “{item.extensionReason}”
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      New due date
                      <input
                        type="date"
                        min={todayStr(item)}
                        value={extDates[item.submissionId] || suggestedDate(item)}
                        onChange={(e) => setExtDates((p) => ({ ...p, [item.submissionId]: e.target.value }))}
                        disabled={busy}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </label>
                    <span className="text-[10px] text-slate-400">Ends 11:59 PM {item.menteeTimezone ? `(${zoneLabel(item.menteeTimezone)})` : ''} in the mentee&apos;s timezone</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <button
                        onClick={() => decideExtension(item, false)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> Decline
                      </button>
                      <button
                        onClick={() => decideExtension(item, true)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
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
