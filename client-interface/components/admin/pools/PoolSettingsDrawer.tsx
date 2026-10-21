'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { useAdminScope } from '@/lib/context/AdminScopeContext';
import { poolsApi, type PoolInput } from '@/lib/services/pools-api';
import { cohortApi } from '@/lib/services/intake-api';
import type { CandidatePool } from '@/lib/types/pool';
import { apiError, field, labelCls, primaryBtn, secondaryBtn } from './poolUi';

type ComponentDraft = { key?: string; label: string; weight: number };

const DEFAULT_COMPONENTS: ComponentDraft[] = [
  { label: 'Quiz', weight: 30 },
  { label: 'Special assignment', weight: 70 },
];

/**
 * Create a pool, or edit one. Size and quota are always the operator's to set;
 * the weights are the scoring policy, so saving a change to them makes a new
 * policy version and the next shortlist uses it.
 */
export function PoolSettingsDrawer({ pool, onClose, onSaved }: {
  pool?: CandidatePool;
  onClose: () => void;
  onSaved: (pool: CandidatePool) => void;
}) {
  const { programs } = useAdminScope();
  const [form, setForm] = useState({
    programId: pool?.programId ?? '',
    name: pool?.name ?? '',
    description: pool?.description ?? '',
    capacity: pool?.capacity ? String(pool.capacity) : '',
    selectionQuota: pool ? String(pool.selectionQuota) : '50',
    cohortId: pool?.cohortId ?? '',
    opensAt: pool?.opensAt?.slice(0, 10) ?? '',
    closesAt: pool?.closesAt?.slice(0, 10) ?? '',
    qualificationDueAt: pool?.qualificationDueAt?.slice(0, 10) ?? '',
    awardPoints: pool?.awardPoints ?? false,
    remindersOn: pool?.reminderPolicy?.enabled !== false,
    inactivityDays: String(pool?.reminderPolicy?.inactivityDays ?? 5),
  });
  const [components, setComponents] = useState<ComponentDraft[]>(
    pool?.scoringPolicy.components.map(({ key, label, weight }) => ({ key, label, weight })) ?? DEFAULT_COMPONENTS,
  );
  const [saving, setSaving] = useState(false);
  const [cohorts, setCohorts] = useState<{ id: string; name: string }[]>([]);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  // Cohorts of the chosen programme: linking one lets the pool pull its applicants.
  useEffect(() => {
    if (!form.programId) { setCohorts([]); return; }
    cohortApi.list({ programId: form.programId })
      .then((r) => setCohorts((r?.data?.cohorts ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => setCohorts([]));
  }, [form.programId]);

  const totalWeight = components.reduce((a, c) => a + (Number(c.weight) || 0), 0);

  const save = async () => {
    if (!pool && !form.programId) { toast.error('Choose a programme'); return; }
    if (!form.name.trim()) { toast.error('Name the pool'); return; }
    if (!(Number(form.selectionQuota) > 0)) { toast.error('Say how many to select'); return; }
    if (!components.length || components.some((c) => !c.label.trim())) { toast.error('Name every scoring component'); return; }
    const body: PoolInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      selectionQuota: Number(form.selectionQuota),
      cohortId: form.cohortId || null,
      opensAt: form.opensAt || null,
      closesAt: form.closesAt || null,
      qualificationDueAt: form.qualificationDueAt || null,
      awardPoints: form.awardPoints,
      components: components.map((c) => ({ ...c, weight: Number(c.weight) || 0 })),
      reminderPolicy: { enabled: form.remindersOn, inactivityDays: Number(form.inactivityDays) || 5 },
    };
    try {
      setSaving(true);
      const res = pool ? await poolsApi.update(pool.id, body) : await poolsApi.create({ ...body, programId: form.programId });
      toast.success(pool ? 'Pool saved' : 'Pool created');
      onSaved(res.data.pool);
    } catch (e) {
      toast.error(apiError(e, 'Could not save the pool'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={pool ? 'Pool settings' : 'New selection pool'}
      subtitle="Candidates are tested here before anybody is placed in a clan."
      width="lg"
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className={secondaryBtn}>Cancel</button>
          <button onClick={save} disabled={saving} className={primaryBtn}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {pool ? 'Save' : 'Create pool'}
          </button>
        </div>
      )}
    >
      <div className="space-y-5">
        {!pool && (
          <div>
            <label className={labelCls}>Programme <span className="text-red-500">*</span></label>
            <SelectMenu
              value={form.programId}
              onChange={(v) => set('programId', v)}
              options={programs.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Choose the programme selected candidates join"
              className="w-full"
            />
          </div>
        )}
        <div>
          <label htmlFor="pool-name" className={labelCls}>Name <span className="text-red-500">*</span></label>
          <input id="pool-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Fellowship 2027 intake" className={field} />
        </div>
        <div>
          <label htmlFor="pool-desc" className={labelCls}>Description</label>
          <textarea id="pool-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={field} />
        </div>
        <div>
          <label className={labelCls}>Intake cohort</label>
          <SelectMenu
            value={form.cohortId}
            onChange={(v) => set('cohortId', v)}
            options={[{ value: '', label: 'None' }, ...cohorts.map((c) => ({ value: c.id, label: c.name }))]}
            placeholder="Optional: pull applicants from a cohort"
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="pool-opens" className={labelCls}>Opens</label>
            <input id="pool-opens" type="date" value={form.opensAt} onChange={(e) => set('opensAt', e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="pool-due" className={labelCls}>Work due by</label>
            <input id="pool-due" type="date" value={form.qualificationDueAt} onChange={(e) => set('qualificationDueAt', e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="pool-closes" className={labelCls}>Stops taking candidates</label>
            <input id="pool-closes" type="date" value={form.closesAt} onChange={(e) => set('closesAt', e.target.value)} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="pool-cap" className={labelCls}>Capacity</label>
            <input id="pool-cap" type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="No limit" className={field} />
          </div>
          <div>
            <label htmlFor="pool-quota" className={labelCls}>Select <span className="text-red-500">*</span></label>
            <input id="pool-quota" type="number" min={1} value={form.selectionQuota} onChange={(e) => set('selectionQuota', e.target.value)} className={field} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={labelCls}>How the score is made</span>
            <span className={`text-xs ${totalWeight === 100 ? 'text-slate-400' : 'text-amber-600'}`}>Weights total {totalWeight}%</span>
          </div>
          <div className="space-y-2">
            {components.map((c, i) => (
              <div key={c.key ?? i} className="flex items-center gap-2">
                <input aria-label="Component" value={c.label} onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="e.g. Interview" className={field} />
                <input aria-label="Weight" type="number" min={0} max={100} value={c.weight} onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} className={`${field} w-24`} />
                <button aria-label="Remove component" onClick={() => setComponents((cs) => cs.filter((_, j) => j !== i))} className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setComponents((cs) => [...cs, { label: '', weight: 0 }])} className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <Plus className="w-4 h-4" />Add component
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.remindersOn} onChange={(e) => set('remindersOn', e.target.checked)} />
            Remind candidates about invites, deadlines and inactivity
          </label>
          {form.remindersOn && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Chase quiet candidates after
              <input type="number" min={1} max={60} value={form.inactivityDays} onChange={(e) => set('inactivityDays', e.target.value)} className={`${field} w-20`} />
              days
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.awardPoints} onChange={(e) => set('awardPoints', e.target.checked)} />
          Award points for approved qualification work (off by default)
        </label>
      </div>
    </Drawer>
  );
}
