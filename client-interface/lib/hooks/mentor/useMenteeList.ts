import { useState, useEffect, useCallback } from 'react';
import { matchingApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';

export interface AssignedMentee {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  programName?: string;
  programId?: string;
  enrollmentId?: string;
  currentLevel?: string;
  currentLevelId?: string;
  status?: string;
}

export function useMenteeList() {
  const [mentees, setMentees] = useState<AssignedMentee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMentees = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // This endpoint should fetch mentees assigned to the current mentor
      const response = await matchingApi.getMatches({ status: 'active' });
      
      const matchesData = response?.data?.matches || [];
      
      // Transform match data to mentee list
      const menteeList: AssignedMentee[] = matchesData
        .filter((match: any) => match.enrollment?.mentee)
        .map((match: any) => ({
          id: match.enrollment.mentee.id,
          userId: match.enrollment.mentee.userId,
          firstName: match.enrollment.mentee.firstName || 'Unknown',
          lastName: match.enrollment.mentee.lastName || 'User',
          email: match.enrollment.mentee.email || '',
          programName: match.enrollment.program?.name || '',
          programId: match.enrollment.program?.id || '',
          enrollmentId: match.enrollment.id,
          currentLevel: match.enrollment.currentLevel?.name || '',
          currentLevelId: match.enrollment.currentLevel?.id || '',
          status: match.status,
        }));
      
      setMentees(menteeList);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to load mentees';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMentees();
  }, [fetchMentees]);

  return {
    mentees,
    isLoading,
    error,
    refetch: fetchMentees,
  };
}
