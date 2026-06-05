'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { enrollmentApi, matchingApi, mentorApi } from '@/lib/services/enrollment-api';
import { programManagementApi } from '@/lib/services/program-api';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const MENTOR_LIMIT = 10;

interface MentorAssignmentProgram {
  id: string;
  name: string;
}

interface MentorAssignmentEnrollment {
  id: string;
  [key: string]: unknown;
}

interface MentorAssignmentMentor {
  id: string;
  [key: string]: unknown;
}

interface MentorAssignmentSuggestion {
  id: string;
  [key: string]: unknown;
}

export interface UseMentorAssignmentReturn {
  // programs
  programs: any[];
  selectedProgram: string;
  setSelectedProgram: (id: string) => void;

  // enrollments / pending matches
  enrollments: any[];
  suggestions: Record<string, any[]>;
  loading: boolean;

  // available mentors panel
  allMentors: any[];
  mentorsLoading: boolean;
  mentorSearch: string;
  setMentorSearch: (v: string) => void;
  mentorPage: number;
  setMentorPage: (p: number | ((prev: number) => number)) => void;
  mentorTotalPages: number;
  mentorTotal: number;

  // actions
  matching: string | null;
  autoMatching: boolean;
  handleCreateMatch: (enrollmentId: string, mentorId: string) => Promise<void>;
  handleAutoMatch: () => Promise<void>;
  refetchEnrollments: () => Promise<void>;
}

export function useMentorAssignment(): UseMentorAssignmentReturn {
  // ── programs ──────────────────────────────────────────────────────────────
  const [programs, setPrograms] = useState<MentorAssignmentProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState('');

  // ── pending matches ────────────────────────────────────────────────────────
  const [enrollments, setEnrollments] = useState<MentorAssignmentEnrollment[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, MentorAssignmentSuggestion[]>>({});
  const [loading, setLoading] = useState(true);

  // ── available mentors ──────────────────────────────────────────────────────
  const [allMentors, setAllMentors] = useState<MentorAssignmentMentor[]>([]);
  const [mentorsLoading, setMentorsLoading] = useState(false);
  const [mentorSearch, setMentorSearch] = useState('');
  const [mentorPage, setMentorPage] = useState(1);
  const [mentorTotalPages, setMentorTotalPages] = useState(1);
  const [mentorTotal, setMentorTotal] = useState(0);
  const debouncedMentorSearch = useDebounce(mentorSearch, 400);

  // ── match actions ──────────────────────────────────────────────────────────
  const [matching, setMatching] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);

  // ── fetch programs (once) ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        setLoading(true);
        const response = await programManagementApi.programs.getAll();
        const list = Array.isArray(response?.data) ? response.data : [];
        setPrograms(list);
        if (list.length > 0) setSelectedProgram(list[0].id);
      } catch {
        toast.error('Failed to load programs');
      } finally {
        setLoading(false);
      }
    };
    fetchPrograms();
  }, []);

  // ── fetch enrollments whenever selected program changes ───────────────────
  const fetchEnrollments = useCallback(async () => {
    if (!selectedProgram) return;
    try {
      setLoading(true);
      const response = await enrollmentApi.getAll({
        programId: selectedProgram,
        status: 'pending_match',
      });
      const list = response?.data?.enrollments || response?.enrollments || [];
      setEnrollments(list);

      // AI mentor suggestions per enrollment
      for (const enrollment of list) {
        try {
          const sRes = await matchingApi.getSuggestions(enrollment.id);
          const suggestionsList = sRes?.data?.suggestions || sRes?.suggestions || [];
          setSuggestions(prev => ({ ...prev, [enrollment.id]: suggestionsList }));
        } catch { /* non-fatal */ }
      }
    } catch {
      toast.error('Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  }, [selectedProgram]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  // ── reset mentor page on search change ────────────────────────────────────
  useEffect(() => {
    setMentorPage(1);
  }, [debouncedMentorSearch]);

  // ── fetch available mentors (paginated + search) ───────────────────────────
  const fetchAllMentors = useCallback(async () => {
    try {
      setMentorsLoading(true);
      const response = await mentorApi.getAll({
        ...(debouncedMentorSearch.trim() && { search: debouncedMentorSearch.trim() }),
        page: mentorPage,
        limit: MENTOR_LIMIT,
      });
      setAllMentors(Array.isArray(response?.data?.mentors) ? response.data.mentors : []);
      setMentorTotalPages(response?.pagination?.totalPages ?? 1);
      setMentorTotal(response?.pagination?.totalItems ?? 0);
    } catch {
      // silent - search errors shouldn't block the page
    } finally {
      setMentorsLoading(false);
    }
  }, [debouncedMentorSearch, mentorPage]);

  useEffect(() => {
    fetchAllMentors();
  }, [fetchAllMentors]);

  // ── manually create a single match ────────────────────────────────────────
  const handleCreateMatch = useCallback(async (
    enrollmentId: string,
    mentorId: string,
  ) => {
    try {
      setMatching(enrollmentId);
      await matchingApi.createMatch({ enrollmentId, mentorId });
      toast.success('Match created successfully!');
      await fetchEnrollments();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to create match'));
    } finally {
      setMatching(null);
    }
  }, [fetchEnrollments]);

  // ── auto-match all pending ─────────────────────────────────────────────────
  const handleAutoMatch = useCallback(async () => {
    const scope = selectedProgram ? ' in this program' : '';
    if (!confirm(`Auto-match all pending enrollments${scope}? This will assign the top AI-suggested mentor to each unmatched mentee.`)) return;
    try {
      setAutoMatching(true);
      const response = await matchingApi.autoMatchPending(selectedProgram || undefined);
      const { summary } = response?.data || {};
      toast.success(
        `Auto-match complete: ${summary?.matched ?? 0} matched, ${summary?.skipped ?? 0} skipped, ${summary?.failed ?? 0} failed`,
      );
      if ((summary?.matched ?? 0) > 0) await fetchEnrollments();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Auto-match failed'));
    } finally {
      setAutoMatching(false);
    }
  }, [selectedProgram, fetchEnrollments]);

  return {
    programs,
    selectedProgram,
    setSelectedProgram,
    enrollments,
    suggestions,
    loading,
    allMentors,
    mentorsLoading,
    mentorSearch,
    setMentorSearch,
    mentorPage,
    setMentorPage,
    mentorTotalPages,
    mentorTotal,
    matching,
    autoMatching,
    handleCreateMatch,
    handleAutoMatch,
    refetchEnrollments: fetchEnrollments,
  };
}
