'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Plus } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { poolsApi } from '@/lib/services/pools-api';
import { quizApi } from '@/lib/services/quiz-api';
import { interviewApi } from '@/lib/services/interview-api';
import type { PoolDashboard } from '@/lib/types/pool';
import { apiError, field, labelCls, primaryBtn, secondaryBtn } from './poolUi';

const WORK_TYPES = [
  { value: 'project', label: 'Project or special assignment' },
  { value: 'exercise', label: 'Exercise' },
  { value: 'reading', label: 'Reading' },
  { value: 'video', label: 'Video' },
  { value: 'open_source', label: 'Open-source contribution' },
  { value: 'quiz', label: 'Quiz (auto-graded)' },
  { value: 'interview', label: 'Interview' },
];

export function WorkTab({ data, canAssign, onChanged }: { data: PoolDashboard; canAssign: boolean; onChanged: () => void }) {
  const [assigning, setAssigning] = useState(false);
  const { components } = data.pool.scoringPolicy;
  const locked = ['reviewing', 'placing', 'closed'].includes(data.pool.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Each piece of work counts toward one part of the score. Candidates without an account yet get it when they register.</p>
        {canAssign && !locked && (
          <button onClick={() => setAssigning(true)} className={primaryBtn}><Plus className="w-4 h-4" />Assign work</button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {components.map((c) => (
          <div key={c.key} className="bg-card rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">{c.label}</p>
              <span className="text-sm font-semibold text-brand-700">{c.weight}%</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5" />{c.workCount ? `${c.workCount} piece(s) of work` : 'No work assigned yet'}
            </p>
          </div>
        ))}
      </div>
      {assigning && <AssignWorkDrawer data={data} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); onChanged(); }} />}
    </div>
  );
}

function AssignWorkDrawer({ data, onClose, onDone }: { data: PoolDashboard; onClose: () => void; onDone: () => void }) {
  const { pool } = data;
  const [form, setForm] = useState({
    componentKey: pool.scoringPolicy.components[0]?.key ?? '',
    type: 'project',
    title: '',
    description: '',
    criteria: '',
    dueDate: pool.qualificationDueAt?.slice(0, 10) ?? '',
    kitId: '',
  });
  const [kits, setKits] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const usesKit = form.type === 'quiz' || form.type === 'interview';

  useEffect(() => {
    if (!usesKit) return;
    const api = form.type === 'quiz' ? quizApi : interviewApi;
    api.listKits('published').then((r) => setKits(r?.data?.kits ?? [])).catch(() => setKits([]));
  }, [form.type, usesKit]);

  const submit = async () => {
    if (usesKit && !form.kitId) { toast.error(`Choose a ${form.type}`); return; }
    if (!usesKit && !form.title.trim()) { toast.error('Give the work a title'); return; }
    try {
      setBusy(true);
      const res = await poolsApi.assignWork(pool.id, {
        componentKey: form.componentKey,
        type: form.type,
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        acceptanceCriteria: form.criteria.split('\n').map((s) => s.trim()).filter(Boolean),
        dueDate: form.dueDate || undefined,
        ...(form.type === 'quiz' ? { quiz: { kitId: form.kitId, evaluationMode: 'auto' as const } } : {}),
        ...(form.type === 'interview' ? { interview: { kitId: form.kitId } } : {}),
      });
      toast.success(`Assigned to ${res.data.assigned} candidate(s)`);
      onDone();
    } catch (e) { toast.error(apiError(e, 'Could not assign the work')); } finally { setBusy(false); }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Assign qualification work"
      subtitle="Uses the normal task, quiz and interview screens. Earns no points."
      width="lg"
      footer={(dismiss) => (
        <div className="flex justify-end gap-2">
          <button onClick={dismiss} className={secondaryBtn}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryBtn}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Assign to every candidate
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Counts toward</label>
            <SelectMenu value={form.componentKey} onChange={(v) => set('componentKey', v)} className="w-full"
              options={pool.scoringPolicy.components.map((c) => ({ value: c.key, label: `${c.label} · ${c.weight}%` }))} />
          </div>
          <div>
            <label className={labelCls}>Kind of work</label>
            <SelectMenu value={form.type} onChange={(v) => { set('type', v); set('kitId', ''); }} options={WORK_TYPES} className="w-full" />
          </div>
        </div>
        {usesKit ? (
          <div>
            <label className={labelCls}>{form.type === 'quiz' ? 'Quiz' : 'Interview kit'}</label>
            <SelectMenu value={form.kitId} onChange={(v) => set('kitId', v)} className="w-full" placeholder="Published kits only"
              options={kits.map((k) => ({ value: k.id, label: k.title }))} />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="pw-title" className={labelCls}>Title</label>
              <input id="pw-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Build a small REST API" className={field} />
            </div>
            <div>
              <label htmlFor="pw-desc" className={labelCls}>Brief</label>
              <textarea id="pw-desc" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="pw-criteria" className={labelCls}>Acceptance criteria</label>
              <textarea id="pw-criteria" rows={3} value={form.criteria} onChange={(e) => set('criteria', e.target.value)} placeholder="One per line. Reviewers mark against these." className={field} />
            </div>
          </>
        )}
        <div>
          <label htmlFor="pw-due" className={labelCls}>Due</label>
          <input id="pw-due" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={field} />
        </div>
      </div>
    </Drawer>
  );
}
