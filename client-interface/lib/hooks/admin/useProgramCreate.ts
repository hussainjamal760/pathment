'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import programManagementApi from '@/lib/services/program-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface ProgramFormData {
  name: string;
  description: string;
  type: string;
  status: string;
  visibility: string;
  totalDurationWeeks: number;
  estimatedHoursPerWeek: number;
  startDate: string;
  endDate: string;
  maxEnrollments: number | '';
  tags: string[];
  learningOutcomes: string[];
  prerequisites: string[];
  targetAudience: string;
}

const DEFAULT_PROGRAM: ProgramFormData = {
  name: '', description: '', type: '', status: 'draft', visibility: 'private',
  totalDurationWeeks: 12, estimatedHoursPerWeek: 10,
  startDate: '', endDate: '', maxEnrollments: '',
  tags: [], learningOutcomes: [], prerequisites: [], targetAudience: '',
};

interface UseProgramCreateReturn {
  loading: boolean;
  programData: ProgramFormData;
  setProgramData: React.Dispatch<React.SetStateAction<ProgramFormData>>;
  tagInput: string;
  setTagInput: (v: string) => void;
  addTag: () => void;
  removeTag: (tag: string) => void;
  outcomeInput: string;
  setOutcomeInput: (v: string) => void;
  addOutcome: () => void;
  removeOutcome: (o: string) => void;
  prerequisiteInput: string;
  setPrerequisiteInput: (v: string) => void;
  addPrerequisite: () => void;
  removePrerequisite: (p: string) => void;
  handleCreateProgram: () => Promise<void>;
}

/**
 * Program creation — a single step. The admin fills in program details; levels
 * no longer exist (curriculum is authored as roadmaps in the Roadmaps area), so
 * on create we land on the program page with the "Author roadmaps" handoff.
 */
export function useProgramCreate(): UseProgramCreateReturn {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [programData, setProgramData] = useState<ProgramFormData>(DEFAULT_PROGRAM);
  const [tagInput, setTagInput] = useState('');
  const [outcomeInput, setOutcomeInput] = useState('');
  const [prerequisiteInput, setPrerequisiteInput] = useState('');

  const addTag = useCallback(() => {
    if (tagInput.trim() && !programData.tags.includes(tagInput.trim())) {
      setProgramData((p) => ({ ...p, tags: [...p.tags, tagInput.trim()] }));
      setTagInput('');
    }
  }, [tagInput, programData.tags]);

  const removeTag = useCallback((tag: string) => {
    setProgramData((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag) }));
  }, []);

  const addOutcome = useCallback(() => {
    if (outcomeInput.trim() && !programData.learningOutcomes.includes(outcomeInput.trim())) {
      setProgramData((p) => ({ ...p, learningOutcomes: [...p.learningOutcomes, outcomeInput.trim()] }));
      setOutcomeInput('');
    }
  }, [outcomeInput, programData.learningOutcomes]);

  const removeOutcome = useCallback((o: string) => {
    setProgramData((p) => ({ ...p, learningOutcomes: p.learningOutcomes.filter((x) => x !== o) }));
  }, []);

  const addPrerequisite = useCallback(() => {
    if (prerequisiteInput.trim() && !programData.prerequisites.includes(prerequisiteInput.trim())) {
      setProgramData((p) => ({ ...p, prerequisites: [...p.prerequisites, prerequisiteInput.trim()] }));
      setPrerequisiteInput('');
    }
  }, [prerequisiteInput, programData.prerequisites]);

  const removePrerequisite = useCallback((prereq: string) => {
    setProgramData((p) => ({ ...p, prerequisites: p.prerequisites.filter((x) => x !== prereq) }));
  }, []);

  const handleCreateProgram = useCallback(async () => {
    try {
      setLoading(true);
      if (!programData.name || !programData.description || !programData.type) {
        toast.error('Please fill in all required fields');
        return;
      }
      const payload = {
        ...programData,
        maxEnrollments: programData.maxEnrollments === '' || isNaN(Number(programData.maxEnrollments))
          ? undefined
          : Number(programData.maxEnrollments),
        startDate: programData.startDate || undefined,
        endDate: programData.endDate || undefined,
      };
      const response = (await programManagementApi.programs.create(payload)) as {
        program?: { id: string };
        data?: { program?: { id: string } };
      };
      const programId = response?.program?.id ?? response?.data?.program?.id;
      if (!programId) throw new Error('Program ID not returned from API');
      toast.success('Program created — now author its roadmaps.');
      router.push(`/admin/programs/${programId}`);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to create program'));
    } finally {
      setLoading(false);
    }
  }, [programData, router]);

  return {
    loading,
    programData, setProgramData,
    tagInput, setTagInput, addTag, removeTag,
    outcomeInput, setOutcomeInput, addOutcome, removeOutcome,
    prerequisiteInput, setPrerequisiteInput, addPrerequisite, removePrerequisite,
    handleCreateProgram,
  };
}
