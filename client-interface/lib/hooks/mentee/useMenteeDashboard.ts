/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';

const WORKING_STATUSES = ['active', 'matched'];
const IN_PROGRESS_STATUSES = ['active', 'matched', 'pending_completion', 'level_completed'];

export interface UseMenteeDashboardReturn {
  enrollments: any[];
  loading: boolean;
  completionLoading: string | null;
  // derived subsets
  currentProgramEnrollments: any[];
  pendingEnrollments: any[];
  approvedEnrollments: any[];
  pendingCompletionEnrollments: any[];
  levelCompletedEnrollments: any[];
  WORKING_STATUSES: string[];
  // actions
  fetchEnrollments: () => Promise<void>;
  handleRequestCompletion: (enrollmentId: string) => Promise<void>;
}

export function useMenteeDashboard(): UseMenteeDashboardReturn {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [completionLoading, setCompletionLoading] = useState<string | null>(null);

  const fetchEnrollments = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const response = await enrollmentApi.getAll({ menteeId: user.id });
      const list = response?.data?.enrollments || response?.enrollments || [];
      setEnrollments(list);
    } catch (err: any) {
      console.error('Failed to fetch enrollments:', err);
      toast.error('Failed to load your enrollments');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchEnrollments();
    }
  }, [user?.id, fetchEnrollments]);

  const handleRequestCompletion = useCallback(async (enrollmentId: string) => {
    try {
      setCompletionLoading(enrollmentId);
      await enrollmentApi.requestCompletion(enrollmentId);
      toast.success('Completion request sent to your mentor for approval!');
      fetchEnrollments();
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to request completion'));
    } finally {
      setCompletionLoading(null);
    }
  }, [fetchEnrollments]);

  return {
    enrollments,
    loading,
    completionLoading,
    currentProgramEnrollments: enrollments.filter(e => IN_PROGRESS_STATUSES.includes(e.status)),
    pendingEnrollments:         enrollments.filter(e => e.status === 'pending_approval'),
    approvedEnrollments:        enrollments.filter(e => e.status === 'approved' || e.status === 'pending_match'),
    pendingCompletionEnrollments: enrollments.filter(e => e.status === 'pending_completion'),
    levelCompletedEnrollments:  enrollments.filter(e => e.status === 'level_completed'),
    WORKING_STATUSES,
    fetchEnrollments,
    handleRequestCompletion,
  };
}
