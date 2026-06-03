import { useCallback, useEffect, useState } from 'react';
import { clanApi } from '@/lib/services/clan-api';

export interface ClanMembershipRow {
  id: string;
  userId: string;
  role: 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team';
  status: string;
  user?: { id: string; firstName: string; lastName: string; email: string; role: string };
}

export interface Clan {
  id: string;
  name: string;
  description?: string;
  status: string;
  tags: string[];
  levelLabel?: string | null;
  maxMentees: number;
  programId: string;
  program?: { id: string; name: string };
  leadMentor?: { id: string; firstName: string; lastName: string } | null;
  memberships?: ClanMembershipRow[];
}

export interface UseAdminClansReturn {
  clans: Clan[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAdminClans(programId?: string): UseAdminClansReturn {
  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await clanApi.list(programId);
      setClans(res?.data?.clans ?? []);
    } catch {
      setError('Failed to load clans');
      setClans([]);
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchClans();
  }, [fetchClans]);

  return { clans, loading, error, refetch: fetchClans };
}
