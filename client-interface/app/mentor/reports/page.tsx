'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Copy, Sparkles, AlertTriangle, Star } from 'lucide-react';
import { useMentorCohort, type CohortMentee } from '@/lib/hooks/mentor';
import { useAuth } from '@/lib/context/AuthContext';

function blendScore(m: CohortMentee): number {
  return Math.round(m.absoluteProgress * 0.45 + m.relativeProgress * 0.35 + m.onTimeRate * 0.2);
}

export default function MentorReports() {
  const { cohort, loading, error, refetch } = useMentorCohort();
  const { user } = useAuth();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [copied, setCopied] = useState(false);

  const report = useMemo(() => {
    if (!cohort.length) return null;
    const size = cohort.length;
    const avgProgress = Math.round(cohort.reduce((n, m) => n + m.absoluteProgress, 0) / size);
    const avgOnTime = Math.round(cohort.reduce((n, m) => n + m.onTimeRate, 0) / size);
    const atRisk = cohort.filter((m) => m.risk !== 'low');
    const pending = cohort.reduce((n, m) => n + m.pendingApprovals, 0);
    const openBlockers = cohort.reduce((n, m) => n + m.openBlockers, 0);

    const highlights = [...cohort].sort((a, b) => blendScore(b) - blendScore(a)).slice(0, 3);

    const actions: string[] = [];
    if (pending > 0) actions.push(`Clear ${pending} pending review${pending > 1 ? 's' : ''} in the Approvals queue.`);
    const goingQuiet = atRisk.filter((m) => m.relativeProgress - m.absoluteProgress < 15);
    if (goingQuiet.length) actions.push(`Reach out to ${goingQuiet.map((m) => m.name.split(' ')[0]).join(', ')} — going quiet.`);
    const struggling = atRisk.filter((m) => m.relativeProgress - m.absoluteProgress >= 15);
    if (struggling.length) actions.push(`Support ${struggling.map((m) => m.name.split(' ')[0]).join(', ')} — fighting real constraints.`);
    if (openBlockers > 0) actions.push(`Help clear ${openBlockers} open blocker${openBlockers > 1 ? 's' : ''} across the cohort.`);
    if (!actions.length) actions.push('Cohort is healthy — keep the steady cadence going.');

    const overview = `Over the past ${period}, your ${size}-mentee cohort sits at ${avgProgress}% average progress and ${avgOnTime}% on-time delivery. ${atRisk.length} need${atRisk.length === 1 ? 's' : ''} a closer look.`;

    return { size, avgProgress, avgOnTime, atRisk, highlights, actions, overview };
  }, [cohort, period]);

  const copy = async () => {
    if (!report) return;
    const lines = [
      `Cohort report — past ${period}${user?.firstName ? ` · ${user.firstName}` : ''}`,
      '',
      report.overview,
      '',
      `Avg progress: ${report.avgProgress}%  |  On-time: ${report.avgOnTime}%  |  At-risk: ${report.atRisk.length}`,
      '',
      'Highlights:',
      ...report.highlights.map((m) => `  • ${m.name} — ${blendScore(m)} score`),
      '',
      'Needs attention:',
      ...(report.atRisk.length ? report.atRisk.map((m) => `  • ${m.name} — ${m.riskReason || m.risk}`) : ['  • None']),
      '',
      'Recommended actions:',
      ...report.actions.map((a) => `  • ${a}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true); toast.success('Report copied');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Could not copy'); }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Reports</h1>
          <p className="text-slate-600">An auto-drafted read of your cohort — copy it into your update.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(['week', 'month'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${period === p ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={copy} disabled={!report} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            <Copy className="w-4 h-4" />{copied ? 'Copied' : 'Copy report'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
        </div>
      ) : !report ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No cohort data to report on yet.</p>
        </div>
      ) : (
        <>
          {/* Overview */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Overview</h2>
            </div>
            <p className="text-sm text-slate-700">{report.overview}</p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[['Avg progress', `${report.avgProgress}%`], ['On-time', `${report.avgOnTime}%`], ['At-risk', String(report.atRisk.length)]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                  <div className="text-xs text-slate-500">{l}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Highlights */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-3 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Highlights</h2>
            <div className="space-y-2">
              {report.highlights.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0"><span className="text-indigo-700 text-xs font-medium">{m.avatar}</span></div>
                  <span className="text-sm text-slate-700 flex-1">{m.name}</span>
                  <span className="text-sm font-semibold text-slate-900">{blendScore(m)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Risks */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />Needs attention</h2>
            {report.atRisk.length === 0 ? (
              <p className="text-sm text-slate-500">Nobody’s at risk right now.</p>
            ) : (
              <div className="space-y-2">
                {report.atRisk.map((m) => (
                  <div key={m.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0"><span className="text-indigo-700 text-xs font-medium">{m.avatar}</span></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{m.name}</p>
                      {m.riskReason && <p className="text-xs text-slate-500">{m.riskReason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recommended actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-3">Recommended actions</h2>
            <ul className="space-y-2">
              {report.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-indigo-400 shrink-0" />{a}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
