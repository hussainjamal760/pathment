import { useCallback, useEffect, useState } from 'react';
import { meetingsApi } from '@/lib/services/meetings-api';

export interface OpenSlot {
  id: string;
  day: string;
  time: string;
  durationMins: number;
}

export interface BookableMentor {
  mentor: { id: string; name: string };
  slots: OpenSlot[];
}

export interface MenteeMeeting {
  id: string;
  kind: string;
  day: string;
  time: string;
  durationMins: number;
  agenda: string | null;
  status: 'scheduled' | 'done' | 'cancelled';
  mentor?: { id: string; firstName: string; lastName: string };
}

export interface UseMenteeMeetingsReturn {
  bookable: BookableMentor[];
  meetings: MenteeMeeting[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMenteeMeetings(): UseMenteeMeetingsReturn {
  const [bookable, setBookable] = useState<BookableMentor[]>([]);
  const [meetings, setMeetings] = useState<MenteeMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [bookRes, meetRes] = await Promise.all([
        meetingsApi.getBookable(),
        meetingsApi.listMeetings(),
      ]);
      setBookable(bookRes?.data?.mentors ?? []);
      setMeetings(meetRes?.data?.meetings ?? []);
    } catch {
      setError('Failed to load your meetings');
      setBookable([]);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { bookable, meetings, loading, error, refetch: fetchAll };
}
