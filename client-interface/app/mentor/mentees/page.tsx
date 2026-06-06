'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Search, Users, TrendingUp, TrendingDown, Minus, Clock, Flag,
  ClipboardCheck, ArrowUpRight, Users2,
} from 'lucide-react';
import { useMentorCohort, type CohortMentee, type CohortMomentum, type CohortRisk } from '@/lib/hooks/mentor';
import { NudgeButton } from '@/components/mentor/NudgeButton';

type Filter = 'all' | 'attention' | 'on_track';

const RISK_BADGE: Record<CohortRisk, { label: string; cls: string }> = {
  high: { label: 'At risk', cls: 'bg-red-50 text-red-700' },
  watch: { label: 'Watch', cls: 'bg-amber-50 text-amber-700' },
  low: { label: 'On track', cls: 'bg-emerald-50 text-emerald-700' },
};

function MomentumIcon({ m }: { m: CohortMomentum }) {
  if (m === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (m === 'down') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

function Avatar({ m }: { m: CohortMentee }) {
  return m.profilePictureUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={m.profilePictureUrl} alt={m.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
    : <div className="w-11 h-11 bg-brand-100 rounded-full flex items-center justify-center shrink-0"><span className="text-brand-700 font-medium text-sm">{m.avatar}</span></div>;
}

export default function MentorMentees() {
  const router = useRouter();
  const { cohort, totals, loading, error, refetch } = useMentorCohort();
  const [search, setSearch] = useState('');
  const [clan, setClan] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');

  // Distinct clans across the cohort, for the clan filter.
  const clans = useMemo(() => {
    const map = new Map<string, string>();
    cohort.forEach((m) => { if (m.clan) map.set(m.clan.id, m.clan.name); });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [cohort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cohort.filter((m) => {
      if (clan !== 'all' && m.clan?.id !== clan) return false;
      if (filter === 'attention' && !(m.risk !== 'low' || m.openBlockers > 0 || m.pendingApprovals > 0)) return false;
      if (filter === 'on_track' && !(m.risk === 'low' && m.momentum !== 'down')) return false;
      if (q && !(m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [cohort, search, clan, filter]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Everyone' },
    { key: 'attention', label: 'Needs attention' },
    { key: 'on_track', label: 'On track' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-slate-900 mb-1">My mentees</h1>
          <p className="text-slate-600">{totals ? `${totals.mentees} mentee${totals.mentees === 1 ? '' : 's'} across ${clans.length || 1} clan${clans.length === 1 ? '' : 's'}` : 'Your cohort across all your clans.'}</p>
        </div>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clan filter chips */}
      {clans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Users2 className="w-3.5 h-3.5" />Clan:</span>
          <button onClick={() => setClan('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${clan === 'all' ? 'bg-brand-600 text-white' : 'bg-card border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
            All clans
          </button>
          {clans.map((c) => (
            <button key={c.id} onClick={() => setClan(c.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${clan === c.id ? 'bg-brand-600 text-white' : 'bg-card border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : cohort.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No mentees yet</p>
          <p className="text-slate-400 text-sm mt-1">Once mentees are placed in your clans, they show up here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-500 text-sm">No mentees match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => {
            const risk = RISK_BADGE[m.risk];
            const fair = Math.round(m.relativeProgress);
            return (
              <div key={m.id} role="button" tabIndex={0}
                onClick={() => router.push(`/mentor/mentees/${m.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/mentor/mentees/${m.id}`); } }}
                className="group text-left bg-card rounded-2xl border border-slate-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start gap-3">
                  <Avatar m={m} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{m.name}</p>
                      <MomentumIcon m={m.momentum} />
                    </div>
                    <p className="text-xs text-slate-400 truncate">{m.program}</p>
                    {m.clan && <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]"><Users2 className="w-2.5 h-2.5" />{m.clan.name}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${risk.cls}`}>{risk.label}</span>
                    <NudgeButton menteeId={m.id} menteeName={m.name} variant="icon" stopPropagation />
                  </div>
                </div>

                {/* Fair progress bar */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${fair}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums w-9 text-right">{fair}%</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span>{m.onTimeRate}% on-time</span>
                  {m.pendingApprovals > 0 && <span className="inline-flex items-center gap-1 text-brand-600"><ClipboardCheck className="w-3 h-3" />{m.pendingApprovals} to review</span>}
                  {m.openBlockers > 0 && <span className="inline-flex items-center gap-1 text-orange-600"><Flag className="w-3 h-3" />{m.openBlockers} blocker{m.openBlockers > 1 ? 's' : ''}</span>}
                  <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{m.lastActive}</span>
                  <span className="ml-auto inline-flex items-center gap-0.5 text-slate-400 group-hover:text-brand-600 transition-colors">Open<ArrowUpRight className="w-3.5 h-3.5" /></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
