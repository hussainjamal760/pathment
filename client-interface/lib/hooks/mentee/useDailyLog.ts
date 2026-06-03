import { useCallback, useEffect, useState } from 'react';
import { menteeApi } from '@/lib/services/mentee-api';

export interface DailyLogEntry {
  id: string;
  dateKey: string;
  tasksDone: string[];
  slotsDone: string[];
  note: string | null;
  loggedAt: string;
}

export interface UseDailyLogReturn {
  entries: DailyLogEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  save: (data: { dateKey: string; tasksDone: string[]; slotsDone?: string[]; note?: string }) => Promise<void>;
}

export function useDailyLog(): UseDailyLogReturn {
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await menteeApi.getDailyLog();
      setEntries(res?.data?.entries ?? []);
    } catch {
      setError('Failed to load your daily log');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (data: { dateKey: string; tasksDone: string[]; slotsDone?: string[]; note?: string }) => {
    await menteeApi.saveDailyLog(data);
    await fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { entries, loading, error, refetch: fetchLogs, save };
}
