'use client';

import { qk, useApiQuery } from '@/lib/query';
import { poolsApi } from '@/lib/services/pools-api';
import type { MyQualification } from '@/lib/types/pool';

/** The selection pools you are a candidate in. Empty for everybody else. */
export function useMyQualification() {
  const { data, loading, error, refetch } = useApiQuery<MyQualification[]>({
    queryKey: qk.me.qualification,
    queryFn: async () => (await poolsApi.mine())?.data?.pools ?? [],
    errorMessage: 'Failed to load your qualification work',
  });
  return { pools: data ?? [], loading, error, refetch };
}
