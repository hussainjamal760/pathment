'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Gift as GiftIcon, Loader2, Plus, X, Sparkles, Trash2 } from 'lucide-react';
import { useRewards, useMentorCohort, type Gift } from '@/lib/hooks/mentor';
import { useAuth } from '@/lib/context/AuthContext';
import { rewardsApi } from '@/lib/services/rewards-api';

function RedeemModal({ gift, onClose, onDone }: { gift: Gift; onClose: () => void; onDone: () => void }) {
  const { cohort } = useMentorCohort();
  const [menteeId, setMenteeId] = useState('');
  const [saving, setSaving] = useState(false);

  const redeem = async () => {
    if (!menteeId) { toast.error('Pick a mentee'); return; }
    try {
      setSaving(true);
      await rewardsApi.redeem(gift.id, menteeId);
      toast.success(`Redeemed "${gift.name}"`);
      onDone(); onClose();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not redeem'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-900 text-lg font-semibold">Redeem · {gift.name}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-3">{gift.costXp.toLocaleString()} XP{gift.stock !== null ? ` · ${gift.stock} left` : ''}</p>
        <label className="block text-sm font-medium text-slate-700 mb-1">For which mentee?</label>
        <select value={menteeId} onChange={(e) => setMenteeId(e.target.value)}
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Select a mentee</option>
          {cohort.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={redeem} disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Redeem
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MentorRewards() {
  const { gifts, redemptions, loading, error, refetch } = useRewards();
  const { availableRoles } = useAuth();
  const isAdmin = availableRoles.includes('admin');

  const [redeeming, setRedeeming] = useState<Gift | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [cost, setCost] = useState('1000');
  const [stock, setStock] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const addGift = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    try {
      setBusy('add');
      await rewardsApi.createGift({ name: name.trim(), description: desc.trim() || undefined, costXp: Number(cost) || 0, stock: stock.trim() === '' ? null : Number(stock) });
      toast.success('Gift added');
      setName(''); setDesc(''); setCost('1000'); setStock(''); setAdding(false);
      refetch();
    } catch { toast.error('Could not add gift'); }
    finally { setBusy(null); }
  };

  const removeGift = async (id: string) => {
    try { setBusy(id); await rewardsApi.removeGift(id); toast.success('Removed'); refetch(); }
    catch { toast.error('Could not remove'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Rewards</h1>
          <p className="text-slate-600">Redeem XP for real things — recognise the work.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setAdding((a) => !a)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 shrink-0">
            <Plus className="w-4 h-4" />New gift
          </button>
        )}
      </div>

      {isAdmin && adding && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gift name" className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" placeholder="XP cost" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <input value={stock} onChange={(e) => setStock(e.target.value)} type="number" placeholder="Stock (∞)" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="flex justify-end">
            <button onClick={addGift} disabled={busy === 'add'} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add gift
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          {gifts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <GiftIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No gifts in the catalog yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {gifts.map((g) => (
                <div key={g.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><GiftIcon className="w-5 h-5 text-indigo-600" /></div>
                    {isAdmin && (
                      <button onClick={() => removeGift(g.id)} disabled={busy === g.id} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                  <h3 className="mt-3 font-medium text-slate-900">{g.name}</h3>
                  {g.description && <p className="text-sm text-slate-500 mt-0.5 flex-1">{g.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-semibold text-indigo-700">{g.costXp.toLocaleString()} XP</span>
                    <span className="text-xs text-slate-400">{g.stock === null ? 'unlimited' : `${g.stock} left`}</span>
                  </div>
                  <button onClick={() => setRedeeming(g)} disabled={g.stock === 0}
                    className="mt-3 w-full px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50">
                    {g.stock === 0 ? 'Out of stock' : 'Redeem'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {redemptions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-200"><h2 className="text-slate-900">Recently redeemed</h2></div>
              <div className="divide-y divide-slate-100">
                {redemptions.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-slate-700 flex-1"><span className="font-medium">{r.gift}</span> → {r.mentee}</span>
                    <span className="text-xs text-slate-400">{r.costXp.toLocaleString()} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {redeeming && <RedeemModal gift={redeeming} onClose={() => setRedeeming(null)} onDone={refetch} />}
    </div>
  );
}
