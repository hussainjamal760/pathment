'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Filter, Loader2, Plus, Users } from 'lucide-react';
import { qk, useApiQuery } from '@/lib/query';
import { poolsApi } from '@/lib/services/pools-api';
import { useCan } from '@/lib/hooks/usePermissions';
import type { CandidatePool } from '@/lib/types/pool';
import { PoolSettingsDrawer } from '@/components/admin/pools/PoolSettingsDrawer';
import { pill, primaryBtn, STATUS_CLASS, STATUS_LABEL } from '@/components/admin/pools/poolUi';

export default function SelectionPoolsPage() {
  const router = useRouter();
  const can = useCan();
  const canManage = can('pool.manage');
  const [creating, setCreating] = useState(false);
  const { data: pools, loading, error, refetch } = useApiQuery<CandidatePool[]>({
    queryKey: qk.admin.pools,
    queryFn: async () => (await poolsApi.list())?.data?.pools ?? [],
    errorMessage: 'Failed to load selection pools',
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-slate-900 mb-2">Selection pools</h1>
          <p className="text-slate-600">Test candidates with real work, review it, and place the strongest into clans.</p>
        </div>
        {canManage && (
          <button onClick={() => setCreating(true)} className={primaryBtn}><Plus className="w-4 h-4" />New pool</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : !pools?.length ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 px-6 text-center">
          <Filter className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No selection pools yet</p>
          <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">A pool holds candidates who are on Pathment but not yet in a clan, so you can test them before choosing who joins.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pools.map((p) => (
            <Link key={p.id} href={`/admin/pools/${p.id}`} className="bg-card rounded-2xl border border-slate-200 p-4 flex items-center gap-3 hover:border-brand-300 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-900">{p.name}</p>
                  <span className={`${pill} ${STATUS_CLASS[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{p.program?.name}</p>
              </div>
              <div className="text-right text-xs text-slate-500 shrink-0">
                <p className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{p.memberCount ?? 0}{p.capacity ? ` / ${p.capacity}` : ''} candidates</p>
                <p>{p.selectedCount ?? 0} of {p.selectionQuota} selected</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <PoolSettingsDrawer onClose={() => setCreating(false)} onSaved={(p) => { setCreating(false); router.push(`/admin/pools/${p.id}`); }} />
      )}
    </div>
  );
}
