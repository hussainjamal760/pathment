'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Settings } from 'lucide-react';
import { qk, useApiQuery } from '@/lib/query';
import { poolsApi } from '@/lib/services/pools-api';
import { useCan } from '@/lib/hooks/usePermissions';
import type { PoolDashboard, PoolStatus } from '@/lib/types/pool';
import { PoolSettingsDrawer } from '@/components/admin/pools/PoolSettingsDrawer';
import { CandidatesTab } from '@/components/admin/pools/CandidatesTab';
import { WorkTab } from '@/components/admin/pools/WorkTab';
import { ReviewsTab } from '@/components/admin/pools/ReviewsTab';
import { SelectionTab } from '@/components/admin/pools/SelectionTab';
import { apiError, pill, secondaryBtn, STATUS_CLASS, STATUS_LABEL } from '@/components/admin/pools/poolUi';

type Tab = 'candidates' | 'work' | 'reviews' | 'selection';

/** The next step an operator can take the pool to by hand. */
const NEXT_STATUS: Partial<Record<PoolStatus, { status: PoolStatus; label: string }>> = {
  draft: { status: 'open', label: 'Open pool' },
  open: { status: 'qualifying', label: 'Start qualifying' },
};

export default function PoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const [tab, setTab] = useState<Tab>('candidates');
  const [editing, setEditing] = useState(false);
  const { data, loading, error, refetch } = useApiQuery<PoolDashboard>({
    queryKey: qk.admin.pool(id),
    queryFn: async () => (await poolsApi.get(id))?.data,
    errorMessage: 'Failed to load the pool',
  });

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;
  if (error || !data) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
        <p className="text-slate-600 mb-3">{error || 'Pool not found'}</p>
        <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
      </div>
    );
  }

  const { pool } = data;
  const next = NEXT_STATUS[pool.status];
  const setStatus = async (status: PoolStatus) => {
    try { await poolsApi.setStatus(pool.id, status); toast.success('Pool updated'); refetch(); } catch (e) { toast.error(apiError(e, 'Could not update the pool')); }
  };
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'candidates', label: 'Candidates', count: data.members.length },
    { key: 'work', label: 'Work' },
    { key: 'reviews', label: 'Reviews', count: data.buckets.needs_review },
    { key: 'selection', label: 'Selection' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/admin/pools" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2"><ArrowLeft className="w-4 h-4" />Selection pools</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-slate-900">{pool.name}</h1>
              <span className={`${pill} ${STATUS_CLASS[pool.status]}`}>{STATUS_LABEL[pool.status]}</span>
            </div>
            <p className="text-slate-600 mt-1">{pool.program?.name} · select {pool.selectionQuota}{pool.capacity ? ` of up to ${pool.capacity}` : ''}</p>
          </div>
          {can('pool.manage') && pool.status !== 'closed' && (
            <div className="flex items-center gap-2">
              {next && <button onClick={() => setStatus(next.status)} className={secondaryBtn}>{next.label}</button>}
              {pool.status === 'placing' && <button onClick={() => setStatus('closed')} className={secondaryBtn}>Close pool</button>}
              <button aria-label="Pool settings" onClick={() => setEditing(true)} className={secondaryBtn}><Settings className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}{t.count ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'candidates' && <CandidatesTab data={data} canMembers={can('pool.members')} onChanged={refetch} />}
      {tab === 'work' && <WorkTab data={data} canAssign={can('pool.assign')} onChanged={refetch} />}
      {tab === 'reviews' && <ReviewsTab poolId={pool.id} onReviewed={refetch} />}
      {tab === 'selection' && <SelectionTab data={data} canSelect={can('pool.select')} onChanged={refetch} />}

      {editing && <PoolSettingsDrawer pool={pool} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); }} />}
    </div>
  );
}
