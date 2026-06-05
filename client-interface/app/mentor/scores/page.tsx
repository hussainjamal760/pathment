'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge, Loader2, TrendingUp, TrendingDown, Minus, ArrowUpRight } from 'lucide-react';
import { useMentorCohort, type CohortMentee, type CohortMomentum } from '@/lib/hooks/mentor';

// Blended progress score from real cohort stats (prototype weighting).
function scoreOf(m: CohortMentee): number {
  const base = m.absoluteProgress * 0.45 + m.relativeProgress * 0.35 + m.onTimeRate * 0.2;
  const nudge = m.momentum === 'up' ? 3 : m.momentum === 'down' ? -3 : 0;
  return Math.max(0, Math.min(100, Math.round(base + nudge)));
}

function MomentumIcon({ momentum }: { momentum: CohortMomentum }) {
  if (momentum === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (momentum === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function scoreColor(s: number): string {
  if (s >= 75) return 'bg-emerald-500';
  if (s >= 50) return 'bg-brand-500';
  if (s >= 30) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function MentorScores() {
  const router = useRouter();
  const { cohort, loading, error, refetch } = useMentorCohort();

  const ranked = useMemo(
    () => cohort.map((m) => ({ m, score: scoreOf(m) })).sort((a, b) => b.score - a.score),
    [cohort]
  );
  const avg = ranked.length ? Math.round(ranked.reduce((n, r) => n + r.score, 0) / ranked.length) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Progress scores</h1>
        <p className="text-slate-600">One blended score per mentee — output, fairness, and reliability together.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : ranked.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Gauge className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No mentees to score yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
            <Gauge className="w-5 h-5 text-brand-500" />
            <span className="text-sm text-slate-600">Cohort average</span>
            <span className="ml-auto text-lg font-semibold text-slate-900 tabular-nums">{avg}</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {ranked.map((r, i) => (
              <button key={r.m.id} onClick={() => router.push(`/mentor/mentees/${r.m.id}`)}
                className="w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                <span className="w-6 text-center text-sm font-semibold text-slate-400 tabular-nums">{i + 1}</span>
                <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-brand-700 text-xs font-medium">{r.m.avatar}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.m.name}</p>
                    <MomentumIcon momentum={r.m.momentum} />
                  </div>
                  <div className="mt-1 h-1.5 w-full max-w-xs rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${scoreColor(r.score)}`} style={{ width: `${r.score}%` }} />
                  </div>
                </div>
                <span className="text-lg font-semibold text-slate-900 tabular-nums shrink-0">{r.score}</span>
                <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
