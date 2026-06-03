import { useCallback, useEffect, useState } from 'react';
import { announcementsApi } from '@/lib/services/announcements-api';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  audienceLabel: string;
  pinned: boolean;
  at: string;
  author: { name: string; role: string } | null;
  reactions: { acknowledged: number; helpful: number };
  myReactions: string[];
}

export interface UseAnnouncementsReturn {
  announcements: Announcement[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAnnouncements(): UseAnnouncementsReturn {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await announcementsApi.list();
      setAnnouncements(res?.data?.announcements ?? []);
    } catch {
      setError('Failed to load announcements');
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { announcements, loading, error, refetch: fetchAll };
}
