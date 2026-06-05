'use client';

import { useState, useEffect, useCallback } from 'react';
import { activityApi } from '@/lib/services/activity-api';
import type { ActivitySummary, DailySession, RecentEvent } from '@/lib/types/activity';

export interface UseMyActivityReturn {
  summary: ActivitySummary | null;
  dailySessions: DailySession[];
  recentEvents: RecentEvent[];
  loading: boolean;
  days: number;
  setDays: (d: number) => void;
  refetch: () => void;
}

export function useMyActivity(): UseMyActivityReturn {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [dailySessions, setDailySessions] = useState<DailySession[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      // apiClient.get<T> returns response.data which is { success, message, data: MyActivityResponse }
      const res = await activityApi.getMySummary(days) as unknown as { data: { summary: ActivitySummary; dailySessions: DailySession[]; recentEvents: RecentEvent[] } };
      const payload = res?.data;
      setSummary(payload?.summary ?? null);
      setDailySessions(payload?.dailySessions ?? []);
      setRecentEvents(payload?.recentEvents ?? []);
    } catch {
      // Non-fatal - activity view failure must never break the dashboard
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Auto-refresh every 5 min so the card stays live without a page reload
  useEffect(() => {
    const id = setInterval(fetchActivity, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchActivity]);

  // Refresh immediately when the tab comes back into focus
  // (mentee was in VSCode / YouTube and switches back)
  useEffect(() => {
    const onFocus = () => fetchActivity();
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchActivity();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchActivity]);

  return {
    summary,
    dailySessions,
    recentEvents,
    loading,
    days,
    setDays,
    refetch: fetchActivity,
  };
}
