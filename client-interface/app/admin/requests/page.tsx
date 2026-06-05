'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { GitPullRequest, Loader2, Check, X, Plus, Trash2, Shield, ArrowRight } from 'lucide-react';
import { useClanRequests } from '@/lib/hooks/admin';
import { clanRequestsApi } from '@/lib/services/clan-requests-api';

type Tab = 'requests' | 'cross' | 'policies';
const CROSS_KINDS = [
  { key: 'cover', label: 'Mentor cover' },
  { key: 'specialist', label: 'Specialist' },
  { key: 'co_mentee_access', label: 'Co-mentee access' },
];
const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', denied: 'bg-slate-100 text-slate-500',
};

export default function AdminClanRequests() {
  const { requests, crossClan, policies, loading, error, refetch } = useClanRequests();
  const [tab, setTab] = useState<Tab>('requests');
  const [busy, setBusy] = useState<string | null>(null);

  // cross-clan form
  const [ccKind, setCcKind] = useState('cover');
  const [ccNote, setCcNote] = useState('');
  // policy form
  const [pTitle, setPTitle] = useState('');
  const [pCategory, setPCategory] = useState('');
  const [pBody, setPBody] = useState('');

  const act = async (id: string, fn: () => Promise<unknown>, msg = 'Done') => {
    try { setBusy(id); await fn(); toast.success(msg); refetch(); } catch (e: any) { toast.error(e?.response?.data?.message || 'Action failed'); } finally { setBusy(null); }
  };

  const addCross = async () => {
    try { setBusy('cc'); await clanRequestsApi.createCrossClan({ kind: ccKind, note: ccNote.trim() || undefined }); toast.success('Added'); setCcNote(''); refetch(); }
    catch { toast.error('Could not add'); } finally { setBusy(null); }
  };
  const addPolicy = async () => {
    if (!pTitle.trim() || !pBody.trim()) { toast.error('Title and body required'); return; }
    try { setBusy('pol'); await clanRequestsApi.createPolicy({ title: pTitle.trim(), category: pCategory.trim() || undefined, body: pBody.trim() }); toast.success('Policy added'); setPTitle(''); setPCategory(''); setPBody(''); refetch(); }
    catch { toast.error('Could not add'); } finally { setBusy(null); }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'requests', label: 'Change requests', count: pendingCount },
    { key: 'cross', label: 'Cross-clan' },
    { key: 'policies', label: 'Policies' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-2">Clan requests</h1>
        <p className="text-slate-600">Move requests, cross-clan support, and the rules that govern them.</p>
      </div>

      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}{t.count ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          {/* Change requests */}
          {tab === 'requests' && (
            requests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
                <GitPullRequest className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600">No clan-change requests.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {requests.map((r) => (
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{r.mentee}</p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span>{r.fromClan || '—'}</span><ArrowRight className="w-3 h-3" /><span>{r.toClan}</span>
                      </div>
                      {r.reason && <p className="text-xs text-slate-500 mt-1">{r.reason}</p>}
                    </div>
                    {r.status === 'pending' ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => act(r.id, () => clanRequestsApi.resolveRequest(r.id, 'approved'), 'Approved — mentee moved')} disabled={busy === r.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50"><Check className="w-3.5 h-3.5" />Approve</button>
                        <button onClick={() => act(r.id, () => clanRequestsApi.resolveRequest(r.id, 'denied'), 'Denied')} disabled={busy === r.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-red-300 hover:text-red-600 disabled:opacity-50"><X className="w-3.5 h-3.5" />Deny</button>
                      </div>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_CLASS[r.status]}`}>{r.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* Cross-clan */}
          {tab === 'cross' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Type</label>
                  <select value={ccKind} onChange={(e) => setCcKind(e.target.value)} className={field}>
                    {CROSS_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>
                </div>
                <input value={ccNote} onChange={(e) => setCcNote(e.target.value)} placeholder="Note (who / which clans)" className={`${field} flex-1 min-w-48`} />
                <button onClick={addCross} disabled={busy === 'cc'} className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                  {busy === 'cc' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add
                </button>
              </div>
              {crossClan.length === 0 ? (
                <p className="text-sm text-slate-500">No cross-clan assignments.</p>
              ) : (
                <div className="space-y-2">
                  {crossClan.map((c) => (
                    <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">{CROSS_KINDS.find((k) => k.key === c.kind)?.label ?? c.kind}</span>
                      <p className="text-sm text-slate-700 flex-1 min-w-0 truncate">{c.note || c.user || '—'}</p>
                      <button onClick={() => act(c.id, () => clanRequestsApi.removeCrossClan(c.id), 'Removed')} disabled={busy === c.id} className="text-slate-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Policies */}
          {tab === 'policies' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                <div className="flex gap-2">
                  <input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="Policy title" className={`${field} flex-1`} />
                  <input value={pCategory} onChange={(e) => setPCategory(e.target.value)} placeholder="Category" className={`${field} w-40`} />
                </div>
                <textarea value={pBody} onChange={(e) => setPBody(e.target.value)} rows={2} placeholder="Policy text" className={`${field} w-full resize-none`} />
                <div className="flex justify-end">
                  <button onClick={addPolicy} disabled={busy === 'pol'} className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                    {busy === 'pol' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add policy
                  </button>
                </div>
              </div>
              {policies.length === 0 ? (
                <p className="text-sm text-slate-500">No policies yet.</p>
              ) : (
                <div className="space-y-2">
                  {policies.map((p) => (
                    <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start gap-2">
                        <Shield className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{p.title}{p.category ? <span className="text-xs text-slate-400 font-normal"> · {p.category}</span> : null}</p>
                          <p className="text-sm text-slate-600 mt-0.5">{p.body}</p>
                        </div>
                        <button onClick={() => act(p.id, () => clanRequestsApi.removePolicy(p.id), 'Removed')} disabled={busy === p.id} className="text-slate-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
