'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { levelMentorApi } from '@/lib/services/level-mentor-api';
import { programManagementApi } from '@/lib/services/program-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface ProgramMentorLevel {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ProgramMentorItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mentorProfile?: {
    title?: string;
    organization?: string;
    specialization?: string[];
    currentMenteeCount?: number;
    maxMentees?: number;
  };
}

export interface LevelAssignment {
  level: ProgramMentorLevel;
  mentors: ProgramMentorItem[];
}

export interface ProgramSummary {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface UseProgramMentorsReturn {
  loading: boolean;
  assignments: LevelAssignment[];
  program: ProgramSummary | null;
  availableMentors: ProgramMentorItem[];
  filteredMentors: ProgramMentorItem[];
  selectedMentor: ProgramMentorItem | null;
  adding: boolean;
  removing: string | null;
  loadingMentors: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setSelectedMentor: (m: ProgramMentorItem | null) => void;
  fetchMentors: () => Promise<void>;
  handleAddMentor: (levelId: string) => Promise<void>;
  handleRemoveMentor: (levelId: string, mentorId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useProgramMentors(): UseProgramMentorsReturn {
  const params = useParams();
  const programId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<LevelAssignment[]>([]);
  const [program, setProgram] = useState<ProgramSummary | null>(null);
  const [availableMentors, setAvailableMentors] = useState<ProgramMentorItem[]>([]);
  const [filteredMentors, setFilteredMentors] = useState<ProgramMentorItem[]>([]);
  const [selectedMentor, setSelectedMentor] = useState<ProgramMentorItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [loadingMentors, setLoadingMentors] = useState(false);
  const [searchQuery, setSearchQueryRaw] = useState('');

  const fetchData = useCallback(async () => {
    if (!programId) return;
    try {
      setLoading(true);
      const [assignmentsRes, programRes] = await Promise.all([
        levelMentorApi.getProgramMentorAssignments(programId),
        programManagementApi.programs.getById(programId),
      ]);
      const res1 = assignmentsRes as { data?: { assignments?: LevelAssignment[] }; assignments?: LevelAssignment[] };
      const res2 = programRes as { data?: { program?: ProgramSummary }; program?: ProgramSummary };
      setAssignments(res1?.data?.assignments ?? res1?.assignments ?? []);
      setProgram(res2?.data?.program ?? res2?.program ?? null);
    } catch (err: unknown) {
      console.error('Failed to fetch data:', err);
      toast.error('Failed to load mentor assignments');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  const fetchMentors = useCallback(async () => {
    try {
      setLoadingMentors(true);
      const response = (await mentorApi.getAll()) as {
        data?: { mentors?: ProgramMentorItem[] };
        mentors?: ProgramMentorItem[];
      };
      const list = response?.data?.mentors ?? response?.mentors ?? [];
      setAvailableMentors(list);
      setFilteredMentors(list);
    } catch (err: unknown) {
      console.error('Failed to fetch mentors:', err);
      toast.error('Failed to load mentors');
    } finally {
      setLoadingMentors(false);
    }
  }, []);

  const setSearchQuery = useCallback((q: string) => {
    setSearchQueryRaw(q);
    if (q.trim()) {
      const lower = q.toLowerCase();
      setFilteredMentors(
        availableMentors.filter((m) => {
          const name = `${m.firstName} ${m.lastName}`.toLowerCase();
          return name.includes(lower) || m.email.toLowerCase().includes(lower);
        })
      );
    } else {
      setFilteredMentors(availableMentors);
    }
  }, [availableMentors]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddMentor = useCallback(async (levelId: string) => {
    if (!selectedMentor) {
      toast.error('Please select a mentor');
      return;
    }
    try {
      setAdding(true);
      await levelMentorApi.assignMentorToLevel(programId, levelId, selectedMentor.id);
      toast.success('Mentor assigned successfully');
      setSelectedMentor(null);
      setSearchQueryRaw('');
      await fetchData();
    } catch (err: unknown) {
      console.error('Failed to add mentor:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to assign mentor'));
    } finally {
      setAdding(false);
    }
  }, [programId, selectedMentor, fetchData]);

  const handleRemoveMentor = useCallback(async (levelId: string, mentorId: string) => {
    if (!confirm('Are you sure you want to remove this mentor from the level?')) return;
    try {
      setRemoving(mentorId);
      await levelMentorApi.removeMentorFromLevel(programId, levelId, mentorId);
      toast.success('Mentor removed successfully');
      await fetchData();
    } catch (err: unknown) {
      console.error('Failed to remove mentor:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to remove mentor'));
    } finally {
      setRemoving(null);
    }
  }, [programId, fetchData]);

  return {
    loading,
    assignments,
    program,
    availableMentors,
    filteredMentors,
    selectedMentor,
    adding,
    removing,
    loadingMentors,
    searchQuery,
    setSearchQuery,
    setSelectedMentor,
    fetchMentors,
    handleAddMentor,
    handleRemoveMentor,
    refetch: fetchData,
  };
}
