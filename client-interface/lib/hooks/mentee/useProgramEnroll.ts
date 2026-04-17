/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { programManagementApi } from '@/lib/services/program-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';

export interface UseProgramEnrollReturn {
  program: any;
  levels: any[];
  loading: boolean;
  enrolling: boolean;
  existingEnrollment: any;
  showConfirmDialog: boolean;
  setShowConfirmDialog: (v: boolean) => void;
  handleEnroll: () => Promise<void>;
}

export function useProgramEnroll(programId: string): UseProgramEnrollReturn {
  const { user } = useAuth();
  const router = useRouter();

  const [program, setProgram] = useState<any>(null);
  const [levels, setLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [existingEnrollment, setExistingEnrollment] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fetchProgram = useCallback(async () => {
    try {
      const response = await programManagementApi.programs.getById(programId);
      setProgram(response?.data?.program || response?.program || response);
    } catch (err: any) {
      console.error('Failed to fetch program:', err);
      toast.error('Failed to load program details');
    }
  }, [programId]);

  const fetchLevels = useCallback(async () => {
    try {
      const response = await programManagementApi.levels.getByProgram(programId);
      const list = response?.data?.levels || response?.levels || response || [];
      setLevels(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.error('Failed to fetch levels:', err);
    }
  }, [programId]);

  const checkEnrollmentStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await enrollmentApi.getAll({ programId, menteeId: user.id });
      const list = response?.data?.enrollments || response?.enrollments || [];
      if (list.length > 0) setExistingEnrollment(list[0]);
    } catch (err: any) {
      console.error('Failed to check enrollment status:', err);
    }
  }, [programId, user?.id]);

  useEffect(() => {
    if (programId && user) {
      setLoading(true);
      Promise.all([fetchProgram(), fetchLevels(), checkEnrollmentStatus()]).finally(() =>
        setLoading(false)
      );
    }
  }, [programId, user, fetchProgram, fetchLevels, checkEnrollmentStatus]);

  const handleEnroll = useCallback(async () => {
    try {
      setEnrolling(true);
      await enrollmentApi.create({ programId });
      toast.success('Enrollment request submitted! Awaiting admin approval.');
      setShowConfirmDialog(false);
      setTimeout(() => router.push('/mentee/dashboard'), 1500);
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to submit enrollment request'));
      setShowConfirmDialog(false);
    } finally {
      setEnrolling(false);
    }
  }, [programId, router]);

  return {
    program,
    levels,
    loading,
    enrolling,
    existingEnrollment,
    showConfirmDialog,
    setShowConfirmDialog,
    handleEnroll,
  };
}
