'use client';

import { useMemo, useState } from 'react';
import { Trophy, Loader2, Award } from 'lucide-react';
import { useMentorCohort, type CohortMentee } from '@/lib/hooks/mentor';

// XP/level derived purely from real cohort stats (no fabricated streaks).
function xpOf(m: CohortMentee): number {
  return Math.round(m.absoluteProgress * 10 + m.onTimeRate * 5 + m.relativeProgress * 4);
}
function levelOf(xp: number): number {
  return Math.floor(xp / 500) + 1;
}
function badgesOf(m: CohortMentee): string[] {
  const b: string[] = [];
  if (m.onTimeRate >= 90) b.push('On-time hero');
  if (m.momentum === 'up') b.push('Momentum');
  if (m.absoluteProgress >= 75) b.push('Top progress');
  if (m.relativeProgress >= 95) b.push('Steady hand');
  return b;
}

const PODIUM_RING = ['ring-amber-300', 'ring-slate-300', 'ring-orange-300'];

export default function MentorLeaderboard() {
  const { cohort, loading, error, refetch } = useMentorCohort();
  const [program, setProgram] = useState('all');

  const programs = useMemo(() => Array.from(new Set(cohort.map((m) => m.program).filter(Boolean))), [cohort]);

  const ranked = useMemo(() => {
    return cohort
      .filter((m) => program === 'all' || m.program === program)
      .map((m) => ({ m, xp: xpOf(m) }))
      .sort((a, b) => b.xp - a.xp);
  }, [cohort, program]);

  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Leaderboard</h1>
        <p className="text-slate-600">Friendly standings — earned from progress, fairness, and reliability.</p>
      </div>

      {programs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {['all', ...programs].map((p) => (
            <button key={p} onClick={() => setProgram(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${program === p ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {p === 'all' ? 'All clans' : p}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
        </div>
      ) : ranked.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No mentees to rank yet.</p>
        </div>
      ) : (
        <>
          {/* Podium */}
          {top3.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {top3.map((r, i) => (
                <div key={r.m.id} className={`bg-white rounded-2xl border border-slate-200 p-5 text-center ${i === 0 ? 'sm:-translate-y-2' : ''}`}>
                  <div className={`w-14 h-14 mx-auto rounded-full bg-indigo-100 ring-4 ${PODIUM_RING[i]} flex items-center justify-center`}>
                    <span className="text-indigo-700 font-semibold">{r.m.avatar}</span>
                  </div>
                  <p className="mt-3 font-medium text-slate-900 truncate">{r.m.name}</p>
                  <p className="text-xs text-slate-500">Level {levelOf(r.xp)} · #{i + 1}</p>
                  <p className="mt-1 text-lg font-semibold text-indigo-700 tabular-nums">{r.xp.toLocaleString()} XP</p>
                </div>
              ))}
            </div>
          )}

          {/* Standings */}
          {rest.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {rest.map((r, i) => (
                <div key={r.m.id} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="w-6 text-center text-sm font-semibold text-slate-400 tabular-nums">{i + 4}</span>
                  <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-indigo-700 text-xs font-medium">{r.m.avatar}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.m.name}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {badgesOf(r.m).map((b) => (
                        <span key={b} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px]">
                          <Award className="w-2.5 h-2.5" />{b}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">{r.xp.toLocaleString()} XP</p>
                    <p className="text-xs text-slate-400">Level {levelOf(r.xp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
