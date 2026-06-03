import { useCallback, useEffect, useState } from 'react';
import { tracksApi, type Track } from '@/lib/services/tracks-api';

export interface UseTracksReturn {
  tracks: Track[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addTask: (id: string, title: string) => Promise<void>;
}

/** Mentor-facing tracks for one mentee (personal lanes + their tasks). */
export function useTracks(menteeId: string | null): UseTracksReturn {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTracks = useCallback(async () => {
    if (!menteeId) { setTracks([]); setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const res = await tracksApi.listForMentee(menteeId);
      setTracks(res?.data?.tracks ?? []);
    } catch {
      setError('Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, [menteeId]);

  const create = useCallback(async (name: string) => {
    if (!menteeId) return;
    await tracksApi.create(menteeId, { name });
    await fetchTracks();
  }, [menteeId, fetchTracks]);

  const rename = useCallback(async (id: string, name: string) => {
    await tracksApi.rename(id, name);
    await fetchTracks();
  }, [fetchTracks]);

  const archive = useCallback(async (id: string) => {
    await tracksApi.setArchived(id, true);
    await fetchTracks();
  }, [fetchTracks]);

  const remove = useCallback(async (id: string) => {
    await tracksApi.remove(id);
    await fetchTracks();
  }, [fetchTracks]);

  const addTask = useCallback(async (id: string, title: string) => {
    await tracksApi.addTask(id, { title });
    await fetchTracks();
  }, [fetchTracks]);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  return { tracks, loading, error, refetch: fetchTracks, create, rename, archive, remove, addTask };
}
