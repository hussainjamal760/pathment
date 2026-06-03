'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { clanApi } from '@/lib/services/clan-api';

export interface MentorClan {
  id: string;
  name: string;
  myRole: 'lead_mentor' | 'co_mentor';
  menteeCount: number;
  mentorCount: number;
}

export interface MentorProgram {
  id: string;
  name: string;
  status: string | null;
  visibility: string | null;
  description: string | null;
  clanCount: number;
  menteeCount: number;
  clans: MentorClan[];
}

export interface UseMentorProgramsReturn {
  programs: MentorProgram[];
  loading: boolean;
  fetchPrograms: () => Promise<void>;
}

/**
 * Programs the mentor runs, derived from the clans they lead/co-mentor — so a
 * mentor sees a program the moment they're assigned a clan in it, even before
 * any mentees arrive (clan-based assignment, not 1:1 matches).
 */
export function useMentorPrograms(): UseMentorProgramsReturn {
  const [programs, setPrograms] = useState<MentorProgram[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrograms = useCallback(async () => {
    try {
      setLoading(true);
      const res = await clanApi.mentorPrograms();
      setPrograms(res?.data?.programs ?? []);
    } catch {
      toast.error('Failed to load your programs');
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  return { programs, loading, fetchPrograms };
}
