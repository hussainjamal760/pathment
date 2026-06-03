'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X, Check, Star, ExternalLink, Loader2, Clock } from 'lucide-react';
import { submissionService } from '@/lib/services/submissionService';
import type { ApprovalItem } from '@/lib/hooks/mentor';

type Decision = 'approved' | 'approved_notes' | 'changes' | 'rejected';

const FEEDBACK_TEMPLATES = [
  'Solid work — meets the bar.',
  'Good effort. A couple of things to tighten before this is done.',
  'Nearly there — see the notes below.',
  'Please address the points below and resubmit.',
];

export function ReviewDrawer({
  item,
  onClose,
  onReviewed,
}: {
  item: ApprovalItem;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(4);
  const [busy, setBusy] = useState<Decision | null>(null);

  const allChecked = useMemo(
    () => item.criteria.length > 0 && item.criteria.every((c) => checked.has(c)),
    [item.criteria, checked]
  );

  const toggle = (c: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  const addTemplate = (t: string) => setNotes((prev) => (prev ? `${prev}\n${t}` : t));

  const submit = async (decision: Decision) => {
    if ((decision === 'approved_notes' || decision === 'changes' || decision === 'rejected') && !notes.trim()) {
      toast.error('Add a short note for this decision');
      return;
    }
    const isApproved = decision === 'approved' || decision === 'approved_notes';
    try {
      setBusy(decision);
      await submissionService.reviewSubmission(item.submissionId, {
        rating,
        feedbackText: notes.trim() || (isApproved ? 'Approved.' : 'Changes requested.'),
        isApproved,
        revisionNotes: isApproved ? undefined : notes.trim(),
        decision,
        checkedCriteria: [...checked],
      });
      toast.success(
        decision === 'approved' || decision === 'approved_notes'
          ? 'Approved'
          : decision === 'changes'
          ? 'Changes requested'
          : 'Rejected'
      );
      onReviewed();
      onClose();
    } catch {
      toast.error('Could not submit the review');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-slate-900 font-semibold truncate">{item.title}</h2>
              {item.isLate && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs">
                  <Clock className="w-3 h-3" />late
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {item.mentee?.name} · v{item.version}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* The task being reviewed (brief + deliverable) */}
          {(item.brief || item.deliverable) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              {item.brief && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">The task</p>
                  <p className="text-sm text-slate-700">{item.brief}</p>
                </div>
              )}
              {item.deliverable && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">Deliverable</p>
                  <p className="text-sm text-slate-700">{item.deliverable}</p>
                </div>
              )}
            </div>
          )}

          {/* Submission */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">Submission</h3>
            <div
              className="prose prose-sm max-w-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
              dangerouslySetInnerHTML={{ __html: item.submissionText || '<p class="text-slate-400">No description provided.</p>' }}
            />
            {item.submissionUrls.length > 0 && (
              <div className="mt-2 space-y-1">
                {item.submissionUrls.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 break-all">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />{u}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Acceptance checklist */}
          {item.criteria.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-slate-700">Acceptance criteria</h3>
                <span className="text-xs text-slate-400">{checked.size}/{item.criteria.length}</span>
              </div>
              <div className="space-y-1.5">
                {item.criteria.map((c) => (
                  <label key={c} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={checked.has(c)} onChange={() => toggle(c)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-700">{c}</span>
                  </label>
                ))}
              </div>
              {!allChecked && (
                <p className="mt-1.5 text-xs text-amber-600">Not all criteria are ticked yet.</p>
              )}
            </div>
          )}

          {/* Rating */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">Quality rating</h3>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} className="p-0.5">
                  <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Feedback templates */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">Quick feedback</h3>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_TEMPLATES.map((t) => (
                <button key={t} onClick={() => addTemplate(t)}
                  className="px-2.5 py-1 rounded-full border border-slate-200 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">Notes to the mentee</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What's good, what to change…"
              className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Footer — 4 decisions */}
        <div className="px-6 py-4 border-t border-slate-200 grid grid-cols-2 gap-2">
          <button onClick={() => submit('approved')} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50">
            {busy === 'approved' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Approve
          </button>
          <button onClick={() => submit('approved_notes')} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 text-sm font-medium disabled:opacity-50">
            {busy === 'approved_notes' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Approve w/ notes
          </button>
          <button onClick={() => submit('changes')} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-700 text-sm font-medium disabled:opacity-50">
            {busy === 'changes' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Request changes
          </button>
          <button onClick={() => submit('rejected')} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-red-50 border border-red-300 text-red-700 text-sm font-medium disabled:opacity-50">
            {busy === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Reject
          </button>
        </div>
      </div>
    </div>
  );
}
