'use client';

import { useEffect, useState } from 'react';
import { qk, useApiQuery } from '@/lib/query';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { poolsApi, type PoolMemberQuery } from '@/lib/services/pools-api';
import type { PoolDashboard } from '@/lib/types/pool';

/**
 * One page of a pool's candidates, filtered on the server so a large pool
 * never sends everybody at once. Changing a filter goes back to page one.
 */
export function usePoolMembers(poolId: string, filters: Omit<PoolMemberQuery, 'page' | 'limit'>, initialLimit = 50) {
  const pagination = usePagination({ initialLimit });
  const { page, limit, setTotal, goToPage } = pagination;
  const key = JSON.stringify(filters);
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) { setLastKey(key); goToPage(1); }

  const params = { ...filters, page, limit };
  const { data, loading } = useApiQuery<PoolDashboard>({
    queryKey: qk.admin.poolMembers(poolId, params),
    queryFn: async () => (await poolsApi.get(poolId, params))?.data,
    errorMessage: 'Failed to load candidates',
  });

  const total = data?.total ?? 0;
  if (pagination.total !== total && !loading) setTotal(total);

  return { members: data?.members ?? [], total, loading, pagination };
}

/** A search box that only reports what was typed once the typing pauses. */
export function useDebounced(value: string, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
