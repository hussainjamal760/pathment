'use client';

import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react';
import { useMyQualification } from '@/lib/hooks/mentee/useMyQualification';
import type { PoolDecision } from '@/lib/types/pool';

const TASK_STATUS: Record<string, { label: string; cls: string }> = {
  assigned: { label: 'To do', cls: 'bg-slate-100 text-slate-600' },
  not_started: { label: 'To do', cls: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In progress', cls: 'bg-brand-50 text-brand-700' },
  submitted: { label: 'Submitted', cls: 'bg-amber-100 text-amber-700' },
  revision_needed: { label: 'Changes requested', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Reviewed', cls: 'bg-emerald-100 text-emerald-700' },
};

const OUTCOME: Record<PoolDecision, string> = {
  selected: 'You were selected. Your clan and mentors are being arranged.',
  waitlisted: 'You are on the waitlist. We will tell you if a place opens.',
  not_selected: 'You were not selected this time. Thank you for taking part.',
  withdrawn: 'You have been withdrawn from this selection.',
  disqualified: 'You are no longer part of this selection.',
};

/**
 * A candidate's qualification work and outcome. Deliberately no score and no
 * rank: those are for the people deciding, not a live leaderboard.
 */
export default function QualificationPage() {
  const { pools, loading, error, refetch } = useMyQualification();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-2">Qualification</h1>
        <p className="text-slate-600">Complete this work so the team can review it before clans are chosen.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : !pools.length ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 px-6 text-center">
          <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">You are not in a selection right now</p>
        </div>
      ) : pools.map((p) => (
        <section key={p.id} className="bg-card rounded-2xl border border-slate-200 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{p.pool.name}</h2>
            {p.pool.description && <p className="text-sm text-slate-600 mt-1">{p.pool.description}</p>}
            {p.pool.qualificationDueAt && !p.outcome && (
              <p className="text-xs text-slate-500 mt-1">Due by {new Date(p.pool.qualificationDueAt).toLocaleDateString()}</p>
            )}
          </div>
          {p.outcome && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
              <span>{p.placedClan ? `You have joined ${p.placedClan.name}.` : OUTCOME[p.outcome]}</span>
            </div>
          )}
          {p.tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No work has been set yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {p.tasks.map((t) => {
                const s = TASK_STATUS[t.status] ?? TASK_STATUS.assigned;
                return (
                  <Link key={t.id} href={`/mentee/tasks/${t.id}`} className="py-3 flex items-center gap-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                      {t.dueDate && <p className="text-xs text-slate-500">Due {new Date(t.dueDate).toLocaleDateString()}</p>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
