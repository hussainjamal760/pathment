'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { programManagementApi } from '@/lib/services/program-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export type ProgramDetailTab = 'overview' | 'levels' | 'mentors' | 'enrollments';

export interface ProgramDetailProgram {
  id: string;
  name: string;
  description?: string;
  status: string;
  type: string;
  tags?: string[];
  totalDurationWeeks?: number;
  estimatedHoursPerWeek?: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  _count?: { enrollments?: number; mentors?: number };
  enrollmentCount?: number;
  mentorCount?: number;
  completion?: number;
}

export interface ProgramLevel {
  id: string;
  name: string;
  durationWeeks: number;
  description?: string;
}

export interface AssignedMentor {
  id: string;
  name: string;
  mentees: number;
  expertise: string;
  title: string;
}

export interface ProgramEnrollment {
  id: string;
  status: string;
  enrolledAt: string;
  mentee?: { id: string; firstName: string; lastName: string; email: string };
}

interface ProgramRoadmap {
  id?: string;
  weeks?: unknown[];
}

interface UseProgramDetailReturn {
  id: string;
  program: ProgramDetailProgram | null;
  loading: boolean;
  levels: ProgramLevel[];
  selectedLevelId: string;
  roadmap: ProgramRoadmap | null;
  loadingRoadmap: boolean;
  generatingRoadmap: boolean;
  assignedMentors: AssignedMentor[];
  enrollments: ProgramEnrollment[];
  loadingEnrollments: boolean;
  shareOpen: boolean;
  shareRef: React.RefObject<HTMLDivElement>;
  setSelectedLevelId: (id: string) => void;
  setShareOpen: (open: boolean) => void;
  copyToClipboard: (text: string, label: string) => void;
  handleGenerateRoadmap: () => Promise<void>;
  handleApproveEnrollment: (enrollmentId: string) => Promise<void>;
  handleRejectEnrollment: (enrollmentId: string) => Promise<void>;
  handleStatusUpdate: (newStatus: string) => Promise<void>;
  updatingStatus: boolean;
  fetchEnrollments: () => Promise<void>;
  fetchRoadmap: () => Promise<void>;
}

export function useProgramDetail(): UseProgramDetailReturn {
  const params = useParams();
  const id = params?.id as string;

  const [program, setProgram] = useState<ProgramDetailProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<ProgramLevel[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string>('');
  const [roadmap, setRoadmap] = useState<ProgramRoadmap | null>(null);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);
  const [assignedMentors, setAssignedMentors] = useState<AssignedMentor[]>([]);
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchProgram = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const response = (await programManagementApi.programs.getById(id)) as {
        data?: { program?: ProgramDetailProgram };
        program?: ProgramDetailProgram;
      };
      setProgram(response?.data?.program ?? response?.program ?? null);
    } catch (err: unknown) {
      console.error('Failed to fetch program:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to load program'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchLevels = useCallback(async () => {
    if (!id) return;
    try {
      const response = (await programManagementApi.levels.getByProgram(id)) as {
        data?: { levels?: ProgramLevel[] };
        levels?: ProgramLevel[];
      } | ProgramLevel[];
      const list: ProgramLevel[] = Array.isArray(response)
        ? response
        : (response as { data?: { levels?: ProgramLevel[] }; levels?: ProgramLevel[] })?.data?.levels
          ?? (response as { data?: { levels?: ProgramLevel[] }; levels?: ProgramLevel[] })?.levels
          ?? [];
      setLevels(list);
      if (list.length > 0) {
        setSelectedLevelId((prev) => prev || list[0].id);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch levels:', err);
    }
  }, [id]);

  // Level-mentor assignment was removed; mentors are matched to mentees directly
  // (clan/MentorMenteeMatch), not assigned to program levels.
  const fetchMentorAssignments = useCallback(async () => {
    setAssignedMentors([]);
  }, []);

  const fetchEnrollments = useCallback(async () => {
    if (!id) return;
    try {
      setLoadingEnrollments(true);
      const response = (await enrollmentApi.getAll({ programId: id })) as {
        data?: { enrollments?: ProgramEnrollment[] };
        enrollments?: ProgramEnrollment[];
      };
      setEnrollments(response?.data?.enrollments ?? response?.enrollments ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      console.error('Failed to fetch enrollments:', e);
      toast.error('Failed to load enrollments');
    } finally {
      setLoadingEnrollments(false);
    }
  }, [id]);

  // Legacy week-based curriculum was removed. Linear roadmaps are authored by
  // mentors/admins in the dedicated Roadmaps area, not per program level here.
  const fetchRoadmap = useCallback(async () => {
    setRoadmap(null);
  }, []);

  useEffect(() => {
    if (id) {
      fetchProgram();
      fetchLevels();
      fetchMentorAssignments();
    }
  }, [id, fetchProgram, fetchLevels, fetchMentorAssignments]);

  // Legacy AI week-curriculum generation was removed. Roadmaps are authored as
  // linear roadmaps in the Roadmaps area.
  const handleGenerateRoadmap = useCallback(async () => {
    toast('Curriculum is now authored as linear roadmaps in the Roadmaps area.');
  }, []);

  const handleApproveEnrollment = useCallback(async (enrollmentId: string) => {
    try {
      await enrollmentApi.approve(enrollmentId);
      toast.success('Enrollment approved successfully');
      await fetchEnrollments();
    } catch (err: unknown) {
      console.error('Failed to approve enrollment:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to approve enrollment'));
    }
  }, [fetchEnrollments]);

  const handleRejectEnrollment = useCallback(async (enrollmentId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    try {
      await enrollmentApi.reject(enrollmentId, reason ?? undefined);
      toast.success('Enrollment rejected');
      await fetchEnrollments();
    } catch (err: unknown) {
      console.error('Failed to reject enrollment:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to reject enrollment'));
    }
  }, [fetchEnrollments]);

  const handleStatusUpdate = useCallback(async (newStatus: string) => {
    if (!program) return;
    const prevStatus = program.status;
    // Optimistic update
    setProgram((prev) => (prev ? { ...prev, status: newStatus } : prev));
    setUpdatingStatus(true);
    try {
      await (programManagementApi.programs.update as (id: string, data: object) => Promise<unknown>)(id, { status: newStatus });
      const labels: Record<string, string> = {
        published: 'Program published successfully',
        archived: 'Program archived successfully',
        completed: 'Program marked as completed',
        draft: 'Program restored to draft',
      };
      toast.success(labels[newStatus] ?? 'Status updated successfully');
    } catch (err: unknown) {
      // Roll back optimistic update on failure
      setProgram((prev) => (prev ? { ...prev, status: prevStatus } : prev));
      toast.error(extractApiErrorMessage(err, 'Failed to update program status'));
    } finally {
      setUpdatingStatus(false);
    }
  }, [id, program]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success(`${label} copied to clipboard!`);
        setShareOpen(false);
      })
      .catch(() => toast.error('Failed to copy to clipboard'));
  }, []);

  return {
    id,
    program,
    loading,
    levels,
    selectedLevelId,
    roadmap,
    loadingRoadmap,
    generatingRoadmap,
    assignedMentors,
    enrollments,
    loadingEnrollments,
    shareOpen,
    shareRef,
    setSelectedLevelId,
    setShareOpen,
    copyToClipboard,
    handleGenerateRoadmap,
    handleApproveEnrollment,
    handleRejectEnrollment,
    handleStatusUpdate,
    updatingStatus,
    fetchEnrollments,
    fetchRoadmap,
  };
}
