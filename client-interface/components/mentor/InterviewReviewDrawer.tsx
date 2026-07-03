'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Mic, Code2, Type, Volume2, Sparkles, Eye, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { interviewApi, type InterviewReview, type ReviewItem } from '@/lib/services/interview-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { fmtClock } from '@/lib/utils/interviewMedia';

const FLAG_LABEL: Record<string, string> = {
  focus_loss: 'Left the tab',
  window_blur: 'Window lost focus',
  fullscreen_exit: 'Exited fullscreen',
  paste_blocked: 'Paste blocked',
  copy_blocked: 'Copy blocked',
  context_menu_blocked: 'Right-click blocked',
};

/**
 * InterviewReviewDrawer — the mentor's review of a completed interview: each
 * question with the candidate's audio/transcript/code, the reference answer, a
 * per-answer score (+ optional AI draft), the proctor log & snapshots, and an
 * overall note that finalizes the task through the normal points/completion path.
 * Also serves the owning mentee read-only (canReview=false, no reference/AI).
 */
export function InterviewReviewDrawer({
  taskId,
  onClose,
  onFinalized,
}: {
  taskId: string;
  onClose: () => void;
  onFinalized?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<InterviewReview | null>(null);
  const [scores, setScores] = useState<Record<string, { points: string; note: string }>>({});
  const [overallNote, setOverallNote] = useState('');
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    interviewApi.getReview(taskId)
      .then((res: any) => {
        const r: InterviewReview = res?.data;
        setReview(r);
        const seed: Record<string, { points: string; note: string }> = {};
        r.items.forEach((it) => {
          seed[it.questionId] = {
            points: it.answer?.pointsAwarded != null ? String(it.answer.pointsAwarded) : '',
            note: it.answer?.scoreNote || '',
          };
        });
        setScores(seed);
      })
      .catch((e: any) => { toast.error(extractApiErrorMessage(e, 'Could not load the interview')); onClose(); })
      .finally(() => setLoading(false));
  }, [taskId, onClose]);

  useEffect(() => { load(); }, [load]);

  const canReview = !!review?.canReview;

  const saveScore = async (it: ReviewItem, patch: { points?: string; note?: string }) => {
    const cur = scores[it.questionId] || { points: '', note: '' };
    const next = { ...cur, ...patch };
    setScores((s) => ({ ...s, [it.questionId]: next }));
    if (!canReview) return;
    const pts = next.points === '' ? undefined : Math.max(0, Math.min(it.points, Number(next.points) || 0));
    try {
      await interviewApi.gradeAnswer(taskId, it.questionId, { pointsAwarded: pts, scoreNote: next.note || null });
    } catch { /* best-effort autosave; finalize re-reads */ }
  };

  const runAiDraft = async (it: ReviewItem) => {
    setAiBusy(it.questionId);
    try {
      const res: any = await interviewApi.aiDraftAnswer(taskId, it.questionId);
      const draft = res?.data?.aiDraft;
      if (draft) {
        await saveScore(it, { points: String(draft.suggestedPoints), note: draft.note });
        toast.success('AI draft applied — adjust if needed');
      }
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'AI draft failed'));
    } finally {
      setAiBusy(null);
    }
  };

  const finalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    try {
      const res: any = await interviewApi.finalizeReview(taskId, overallNote || undefined);
      toast.success(`Interview graded — ${res?.data?.pointsPercent ?? ''}%`);
      onFinalized?.();
      onClose();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not finalize the review'));
    } finally {
      setFinalizing(false);
    }
  };

  const totalAwarded = review?.items.reduce((s, it) => s + (Number(scores[it.questionId]?.points) || 0), 0) ?? 0;
  const totalPossible = review?.totals.totalPossible ?? 0;

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={review?.kit.title ? `Interview · ${review.kit.title}` : 'Interview review'}
      subtitle={review?.session?.mentee ? `${review.session.mentee.name} · attempt ${review.session.attemptNumber}` : undefined}
      footer={canReview ? (
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Close</button>
          <button onClick={finalize} disabled={finalizing} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Finalize · {totalAwarded}/{totalPossible} pts
          </button>
        </>
      ) : (
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Close</button>
      )}
    >
      {loading || !review ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : (
        <div className="space-y-5">
          {/* Score summary */}
          <div className="flex items-center gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-900 tabular-nums">{totalAwarded}<span className="text-slate-400 text-lg">/{totalPossible}</span></div>
              <div className="text-[11px] text-slate-500">points</div>
            </div>
            <div className="text-sm text-slate-600">
              {review.totals.questionCount} question{review.totals.questionCount === 1 ? '' : 's'}
              {review.session?.submittedAt && <span className="text-slate-400"> · submitted {new Date(review.session.submittedAt).toLocaleDateString()}</span>}
              {review.task.status === 'completed' && <span className="ml-2 text-emerald-600 font-medium">Graded</span>}
            </div>
          </div>

          {/* Proctor summary */}
          {(review.proctor.snapshots.length > 0 || review.proctor.flags.length > 0) && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Eye className="w-4 h-4 text-slate-500" /> Proctoring
              </div>
              {Object.keys(review.proctor.flagCounts).length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {Object.entries(review.proctor.flagCounts).map(([type, count]) => (
                    <span key={type} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                      <AlertTriangle className="w-3 h-3" />{FLAG_LABEL[type] || type} · {count}
                    </span>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400 mb-3">No flags raised.</p>}
              {review.proctor.snapshots.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {review.proctor.snapshots.map((s, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={s.url} alt={`Snapshot ${i + 1}`} title={new Date(s.at).toLocaleTimeString()}
                      className="w-20 h-14 rounded-lg object-cover border border-slate-200 shrink-0" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Per-question review */}
          {review.items.map((it, i) => {
            const KindIcon = it.kind === 'code' ? Code2 : it.kind === 'text' ? Type : Mic;
            const a = it.answer;
            const sc = scores[it.questionId] || { points: '', note: '' };
            return (
              <div key={it.questionId} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <KindIcon className="w-4 h-4 text-brand-600" /> Q{i + 1}
                    <span className="text-slate-400 font-normal">· {it.points} pts</span>
                    {a?.timeSpentSeconds ? <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="w-3 h-3" />{fmtClock(a.timeSpentSeconds)}</span> : null}
                  </div>
                </div>
                <p className="text-sm text-slate-900 mb-3">{it.prompt}</p>

                {/* Candidate answer */}
                {!a ? (
                  <p className="text-sm text-slate-400 italic">No answer given.</p>
                ) : (
                  <div className="space-y-2">
                    {a.audioUrl && (
                      <audio controls src={a.audioUrl} className="w-full h-9">
                        <track kind="captions" />
                      </audio>
                    )}
                    {a.transcript && (
                      <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{a.transcript}</div>
                    )}
                    {a.code && (
                      <pre className="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-x-auto font-mono">{a.code}</pre>
                    )}
                    {a.answerText && (
                      <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{a.answerText}</div>
                    )}
                  </div>
                )}

                {/* Reference answer (mentor only) */}
                {it.referenceAnswer && (
                  <details className="mt-3">
                    <summary className="text-xs font-medium text-brand-600 cursor-pointer">Reference answer</summary>
                    <div className="text-sm text-slate-600 bg-amber-50/50 rounded-lg p-3 mt-1.5 whitespace-pre-wrap">{it.referenceAnswer}</div>
                  </details>
                )}

                {/* Scoring (mentor) or the awarded score (read-only) */}
                {canReview ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                        Score
                        <input type="number" min={0} max={it.points} value={sc.points}
                          onChange={(e) => saveScore(it, { points: e.target.value })}
                          className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <span className="text-slate-400">/ {it.points}</span>
                      </label>
                      {review.options.aiGradingEnabled && (
                        <button onClick={() => runAiDraft(it)} disabled={aiBusy === it.questionId}
                          className="ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-50">
                          {aiBusy === it.questionId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          AI draft
                        </button>
                      )}
                    </div>
                    <input value={sc.note} onChange={(e) => saveScore(it, { note: e.target.value })}
                      placeholder="Note on this answer (optional)"
                      className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                ) : (
                  (a?.pointsAwarded != null || a?.scoreNote) && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
                      {a?.pointsAwarded != null && <span className="font-medium text-slate-900">{a.pointsAwarded} / {it.points} pts</span>}
                      {a?.scoreNote && <p className="text-slate-600 mt-1">{a.scoreNote}</p>}
                    </div>
                  )
                )}
              </div>
            );
          })}

          {/* Overall note */}
          {canReview && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 inline-flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-slate-400" /> Overall feedback
              </label>
              <textarea value={overallNote} onChange={(e) => setOverallNote(e.target.value)} rows={3}
                placeholder="Summary the mentee will see when you finalize…"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export default InterviewReviewDrawer;
