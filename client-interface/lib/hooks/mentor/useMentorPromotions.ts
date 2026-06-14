import { useCallback, useEffect, useState } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';

export type PromotionStage = 'nominated' | 'interview' | 'approved' | 'promoted' | 'rejected';

export interface PromotionCandidate {
  id: string;
  menteeId: string;
  stage: PromotionStage;
  name: string;
  avatar: string;
  program: string | null;
  level: string | null;
  absoluteProgress: number;
  onTimeRate: number;
  readiness: number;
  willingness: number;
  motivation: string | null;
  strengths: string | null;
  availability: string | null;
  // Decision-support context for the interview drawer.
  lastActive?: string | null;
  momentum?: 'up' | 'steady' | 'down' | null;
  openBlockers?: number;
  signals?: string[];
  traits?: { resilience: number; communication: number; consistency: number };
  suggestedStrengths?: string[];
}

export interface UseMentorPromotionsReturn {
  candidates: PromotionCandidate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMentorPromotions(): UseMentorPromotionsReturn {
  const [candidates, setCandidates] = useState<PromotionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await mentorApi.listPromotions();
      setCandidates(res?.data?.candidates ?? []);
    } catch {
      setError('Failed to load promotion candidates');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  return { candidates, loading, error, refetch: fetchCandidates };
}
