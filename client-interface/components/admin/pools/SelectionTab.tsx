'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2, Sparkles } from 'lucide-react';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { useAdminScope } from '@/lib/context/AdminScopeContext';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { poolsApi } from '@/lib/services/pools-api';
import type { PoolDashboard, PoolDecision, PoolMemberRow } from '@/lib/types/pool';
import { apiError, DECISION_CLASS, DECISION_LABEL, field, pill, primaryBtn, secondaryBtn } from './poolUi';

type Override = { decision: PoolDecision; reason: string };
const CHOICES: PoolDecision[] = ['selected', 'waitlisted', 'not_selected'];

/**
 * Score, shortlist, decide, place. The system proposes from reviewed work
 * only; a person confirms, and every change to the proposal carries a reason.
 */
export function SelectionTab({ data, canSelect, onChanged }: { data: PoolDashboard; canSelect: boolean; onChanged: () => void }) {
  const { pool, members, latestSnapshot: snap } = data;
  const confirm = useConfirm();
  const { clans } = useAdminScope();
  const [busy, setBusy] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [placement, setPlacement] = useState<Record<string, string>>({});
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const programClans = clans.filter((c) => c.programId === pool.programId && c.kind !== 'standing');
  const stale = snap && snap.policyVersion !== pool.scoringPolicy.version;
  const placing = pool.status === 'placing';

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    try { setBusy(key); await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error(apiError(e, 'Action failed')); } finally { setBusy(null); }
  };

  const finalize = async () => {
    const list = Object.entries(overrides).map(([memberId, o]) => ({ memberId, ...o }));
    const ok = await confirm({ title: 'Confirm the selection?', description: 'Candidates are told their outcome and open work is closed.', confirmLabel: 'Confirm' });
    if (ok) run('finalize', () => poolsApi.finalize(pool.id, list), 'Selection confirmed');
  };

  const place = () => {
    const placements = Object.entries(placement).filter(([, clanId]) => clanId).map(([memberId, clanId]) => ({ memberId, clanId }));
    if (!placements.length) { toast.error('Choose a clan for at least one candidate'); return; }
    run('place', async () => {
      const res = await poolsApi.place(pool.id, placements);
      const failed = res.data.results.filter((r: { result: string }) => r.result === 'failed');
      if (failed.length) toast.error(`${failed.length} could not be placed: ${failed[0].reason}`);
    }, 'Placement run finished');
  };

  const selected = members.filter((m) => m.decision === 'selected');
  const ranked = snap ? snap.entries.map((e) => ({ entry: e, member: byId.get(e.memberId) })).filter((r) => r.member) as { entry: (typeof snap.entries)[number]; member: PoolMemberRow }[] : [];

  return (
    <div className="space-y-5">
      {canSelect && !placing && pool.status !== 'closed' && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => run('propose', () => poolsApi.proposeShortlist(pool.id), 'Shortlist proposed')} disabled={!!busy} className={secondaryBtn}>
            {busy === 'propose' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Propose top {pool.selectionQuota}
          </button>
          {snap && !stale && (
            <button onClick={finalize} disabled={!!busy || snap.blockers.pendingReview.length > 0} className={primaryBtn}>
              {busy === 'finalize' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Confirm selection
            </button>
          )}
        </div>
      )}

      {snap && (stale || snap.blockers.pendingReview.length > 0 || snap.blockers.tieAtCutoff.length > 0) && !placing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
          <p className="font-medium inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Needs a person before it can be confirmed</p>
          {stale && <p>The scoring changed since this shortlist. Propose it again.</p>}
          {snap.blockers.pendingReview.length > 0 && <p>{snap.blockers.pendingReview.length} candidate(s) have work waiting for review.</p>}
          {snap.blockers.tieAtCutoff.length > 0 && <p>{snap.blockers.tieAtCutoff.length} candidates are tied at the cutoff. Choose an outcome for each, with a reason.</p>}
        </div>
      )}

      {placing ? (
        <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {selected.length === 0 && <p className="p-4 text-sm text-slate-500">Nobody was selected.</p>}
          {selected.map((m) => (
            <div key={m.id} className="p-3 flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-slate-900 flex-1 min-w-0 truncate">{m.name || m.email}</p>
              {m.placedClan ? (
                <span className={`${pill} bg-emerald-100 text-emerald-700`}>Placed in {m.placedClan.name}</span>
              ) : canSelect && (
                <SelectMenu value={placement[m.id] ?? ''} onChange={(v) => setPlacement((p) => ({ ...p, [m.id]: v }))} placeholder="Choose a clan" className="w-56"
                  options={programClans.map((c) => ({ value: c.id, label: c.name }))} />
              )}
            </div>
          ))}
          {canSelect && selected.some((m) => !m.placedClan) && (
            <div className="p-3 flex justify-end">
              <button onClick={place} disabled={!!busy} className={primaryBtn}>{busy === 'place' && <Loader2 className="w-4 h-4 animate-spin" />}Place candidates</button>
            </div>
          )}
        </div>
      ) : !snap ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-10 text-center text-sm text-slate-500">
          Propose a shortlist once the work is reviewed. It ranks reviewed scores only.
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {ranked.map(({ entry, member }) => {
            const tied = snap.blockers.tieAtCutoff.includes(member.id);
            const o = overrides[member.id];
            return (
              <div key={member.id} className={`p-3 space-y-2 ${entry.proposed ? '' : 'opacity-80'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-8 text-sm font-semibold text-slate-500">#{entry.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{member.name || member.email}</p>
                    <p className="text-xs text-slate-500">
                      {member.components.map((c) => `${c.label} ${c.score ?? '–'} × ${c.weight}%`).join(' · ')}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{entry.total}</span>
                  {tied && <span className={`${pill} bg-amber-100 text-amber-700`}>Tie</span>}
                  {canSelect ? (
                    <SelectMenu
                      value={o?.decision ?? (entry.proposed ? 'selected' : 'not_selected')}
                      onChange={(v) => setOverrides((prev) => ({ ...prev, [member.id]: { decision: v as PoolDecision, reason: prev[member.id]?.reason ?? '' } }))}
                      options={CHOICES.map((d) => ({ value: d, label: DECISION_LABEL[d] }))}
                      className="w-40"
                    />
                  ) : (
                    <span className={`${pill} ${DECISION_CLASS[entry.proposed ? 'selected' : 'not_selected']}`}>{entry.proposed ? 'Proposed' : 'Below cutoff'}</span>
                  )}
                </div>
                {o && (
                  <input value={o.reason} onChange={(e) => setOverrides((prev) => ({ ...prev, [member.id]: { ...o, reason: e.target.value } }))}
                    placeholder="Reason for this decision (required)" className={field} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
