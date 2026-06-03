import { useCallback, useEffect, useState } from 'react';
import { rewardsApi } from '@/lib/services/rewards-api';

export interface Gift {
  id: string;
  name: string;
  description: string | null;
  costXp: number;
  stock: number | null;
}
export interface Redemption {
  id: string;
  gift: string;
  mentee: string | null;
  costXp: number;
  at: string;
}

export interface UseRewardsReturn {
  gifts: Gift[];
  redemptions: Redemption[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useRewards(): UseRewardsReturn {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await rewardsApi.overview();
      setGifts(res?.data?.gifts ?? []);
      setRedemptions(res?.data?.redemptions ?? []);
    } catch {
      setError('Failed to load rewards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { gifts, redemptions, loading, error, refetch: fetchAll };
}
