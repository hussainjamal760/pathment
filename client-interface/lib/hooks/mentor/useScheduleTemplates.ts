import { useCallback, useEffect, useState } from 'react';
import { scheduleApi, type ScheduleBlock } from '@/lib/services/schedule-api';

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string | null;
  source: 'org' | 'mentor';
  blocks: ScheduleBlock[];
}

export interface UseScheduleTemplatesReturn {
  local: ScheduleTemplate[];
  org: ScheduleTemplate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useScheduleTemplates(): UseScheduleTemplatesReturn {
  const [local, setLocal] = useState<ScheduleTemplate[]>([]);
  const [org, setOrg] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await scheduleApi.listTemplates();
      setLocal(res?.data?.local ?? []);
      setOrg(res?.data?.org ?? []);
    } catch {
      setError('Failed to load schedule templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { local, org, loading, error, refetch: fetchAll };
}
