'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import programManagementApi from '@/lib/services/program-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface ProgramFormData {
  name: string;
  description: string;
  type: string;
  status: string;
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

export interface LevelFormData {
  name: string;
  description: string;
  orderIndex: number;
  durationWeeks: number;
  learningOutcomes: string[];
  prerequisites: string[];
  isOptional: boolean;
}

export interface SavedLevel extends LevelFormData {
  id: string;
  [key: string]: unknown;
}

const DEFAULT_PROGRAM: ProgramFormData = {
  name: '', description: '', type: '', status: 'draft',
  totalDurationWeeks: 12, estimatedHoursPerWeek: 10,
  startDate: '', endDate: '', maxEnrollments: '',
  tags: [], learningOutcomes: [], prerequisites: [], targetAudience: '',
};

const DEFAULT_LEVEL: LevelFormData = {
  name: '', description: '', orderIndex: 0, durationWeeks: 4,
  learningOutcomes: [], prerequisites: [], isOptional: false,
};

interface UseProgramCreateReturn {
  /* Step control */
  currentStep: number;
  loading: boolean;
  createdProgramId: string | null;
  createdLevels: SavedLevel[];
  /* Step 1 */
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
  /* Step 2 */
  levels: LevelFormData[];
  currentLevel: LevelFormData;
  setCurrentLevel: React.Dispatch<React.SetStateAction<LevelFormData>>;
  editingLevelIndex: number | null;
  editingLevelId: string | null;
  levelOutcomeInput: string;
  setLevelOutcomeInput: (v: string) => void;
  addLevelOutcome: () => void;
  removeLevelOutcome: (o: string) => void;
  levelPrerequisiteInput: string;
  setLevelPrerequisiteInput: (v: string) => void;
  addLevelPrerequisite: () => void;
  removeLevelPrerequisite: (p: string) => void;
  handleAddLevel: () => Promise<void>;
  handleRemoveLevel: (index: number, levelId?: string) => Promise<void>;
  handleEditLevel: (index: number, level: LevelFormData | SavedLevel, levelId?: string) => void;
  handleCancelEdit: () => void;
  handleSaveLevels: () => Promise<void>;
  /* Step 3 */
  selectedLevelForRoadmap: number | null;
  roadmapInstructions: string;
  setRoadmapInstructions: (v: string) => void;
  generatingRoadmap: boolean;
  handleGenerateRoadmap: (levelIndex: number) => Promise<void>;
  handleFinish: () => void;
  /* Helpers */
  goBack: () => void;
}

export function useProgramCreate(): UseProgramCreateReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const programIdFromUrl = searchParams.get('programId');
  const stepFromUrl = searchParams.get('step');

  const [currentStep, setCurrentStep] = useState(stepFromUrl ? parseInt(stepFromUrl) : 1);
  const [loading, setLoading] = useState(false);
  const [createdProgramId, setCreatedProgramId] = useState<string | null>(programIdFromUrl);
  const [createdLevels, setCreatedLevels] = useState<SavedLevel[]>([]);

  // Step 1
  const [programData, setProgramData] = useState<ProgramFormData>(DEFAULT_PROGRAM);
  const [tagInput, setTagInput] = useState('');
  const [outcomeInput, setOutcomeInput] = useState('');
  const [prerequisiteInput, setPrerequisiteInput] = useState('');

  // Step 2
  const [levels, setLevels] = useState<LevelFormData[]>([]);
  const [editingLevelIndex, setEditingLevelIndex] = useState<number | null>(null);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<LevelFormData>({ ...DEFAULT_LEVEL });
  const [levelOutcomeInput, setLevelOutcomeInput] = useState('');
  const [levelPrerequisiteInput, setLevelPrerequisiteInput] = useState('');

  // Step 3
  const [selectedLevelForRoadmap, setSelectedLevelForRoadmap] = useState<number | null>(null);
  const [roadmapInstructions, setRoadmapInstructions] = useState('');
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);

  // Restore from URL
  useEffect(() => {
    if (programIdFromUrl && !createdProgramId) {
      setCreatedProgramId(programIdFromUrl);
      if (stepFromUrl) setCurrentStep(parseInt(stepFromUrl));
    }
  }, [programIdFromUrl, stepFromUrl, createdProgramId]);

  // Fetch levels when moving to step 2/3
  useEffect(() => {
    const fetchLevels = async () => {
      if (createdProgramId && (currentStep === 2 || currentStep === 3) && createdLevels.length === 0) {
        try {
          setLoading(true);
          const response = (await programManagementApi.levels.getByProgram(createdProgramId)) as {
            levels?: SavedLevel[];
          } | SavedLevel[];
          const lvls = Array.isArray(response)
            ? response
            : (response as { levels?: SavedLevel[] })?.levels ?? [];
          setCreatedLevels(Array.isArray(lvls) ? lvls : []);
        } catch (err: unknown) {
          console.error('Failed to fetch levels:', err);
          toast.error('Could not load existing levels');
        } finally {
          setLoading(false);
        }
      }
    };
    fetchLevels();
  }, [createdProgramId, currentStep, createdLevels.length]);

  // ── Tag helpers ──────────────────────────────────────────────────────────────
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

  // ── Level array helpers ───────────────────────────────────────────────────────
  const addLevelOutcome = useCallback(() => {
    if (levelOutcomeInput.trim() && !currentLevel.learningOutcomes.includes(levelOutcomeInput.trim())) {
      setCurrentLevel((l) => ({ ...l, learningOutcomes: [...l.learningOutcomes, levelOutcomeInput.trim()] }));
      setLevelOutcomeInput('');
    }
  }, [levelOutcomeInput, currentLevel.learningOutcomes]);

  const removeLevelOutcome = useCallback((o: string) => {
    setCurrentLevel((l) => ({ ...l, learningOutcomes: l.learningOutcomes.filter((x) => x !== o) }));
  }, []);

  const addLevelPrerequisite = useCallback(() => {
    if (levelPrerequisiteInput.trim() && !currentLevel.prerequisites.includes(levelPrerequisiteInput.trim())) {
      setCurrentLevel((l) => ({ ...l, prerequisites: [...l.prerequisites, levelPrerequisiteInput.trim()] }));
      setLevelPrerequisiteInput('');
    }
  }, [levelPrerequisiteInput, currentLevel.prerequisites]);

  const removeLevelPrerequisite = useCallback((prereq: string) => {
    setCurrentLevel((l) => ({ ...l, prerequisites: l.prerequisites.filter((x) => x !== prereq) }));
  }, []);

  // ── Step 1 ────────────────────────────────────────────────────────────────────
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
      setCreatedProgramId(programId);
      router.push(`/admin/programs/create?programId=${programId}&step=2`);
      toast.success('Program created successfully');
      setCurrentStep(2);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to create program'));
    } finally {
      setLoading(false);
    }
  }, [programData, router]);

  // ── Step 2 ────────────────────────────────────────────────────────────────────
  const resetLevelForm = useCallback(() => {
    setCurrentLevel({ ...DEFAULT_LEVEL });
    setEditingLevelIndex(null);
    setEditingLevelId(null);
    setLevelOutcomeInput('');
    setLevelPrerequisiteInput('');
  }, []);

  const handleAddLevel = useCallback(async () => {
    if (!currentLevel.name || !currentLevel.durationWeeks) {
      toast.error('Please fill in level name and duration');
      return;
    }
    try {
      setLoading(true);
      if (editingLevelId) {
        const response = (await programManagementApi.levels.update(editingLevelId, currentLevel)) as {
          data?: { level?: SavedLevel };
          level?: SavedLevel;
        };
        const updated = response.data?.level ?? response.level ?? ({ ...currentLevel, id: editingLevelId } as SavedLevel);
        setCreatedLevels((prev) => prev.map((l) => (l.id === editingLevelId ? updated : l)));
        toast.success('Level updated successfully');
      } else if (createdProgramId) {
        const levelData = { ...currentLevel, orderIndex: createdLevels.length + levels.length };
        const response = (await programManagementApi.levels.create(createdProgramId, levelData)) as {
          data?: { level?: SavedLevel };
          level?: SavedLevel;
        };
        const saved = response.data?.level ?? response.level ?? ({ ...levelData } as SavedLevel);
        setCreatedLevels((prev) => [...prev, saved]);
        toast.success('Level added successfully');
      } else {
        if (editingLevelIndex !== null) {
          setLevels((prev) => {
            const u = [...prev];
            u[editingLevelIndex] = { ...currentLevel, orderIndex: editingLevelIndex };
            return u;
          });
        } else {
          setLevels((prev) => [...prev, { ...currentLevel, orderIndex: prev.length }]);
        }
      }
      resetLevelForm();
    } catch (err: unknown) {
      console.error('Level save error:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to save level'));
    } finally {
      setLoading(false);
    }
  }, [currentLevel, editingLevelId, editingLevelIndex, createdProgramId, createdLevels, levels, resetLevelForm]);

  const handleRemoveLevel = useCallback(async (index: number, levelId?: string) => {
    if (levelId) {
      try {
        setLoading(true);
        await programManagementApi.levels.delete(levelId);
        setCreatedLevels((prev) => prev.filter((l) => l.id !== levelId));
        toast.success('Level deleted successfully');
      } catch (err: unknown) {
        toast.error(extractApiErrorMessage(err, 'Failed to delete level'));
      } finally {
        setLoading(false);
      }
    } else {
      setLevels((prev) => prev.filter((_, i) => i !== index));
    }
  }, []);

  const handleEditLevel = useCallback((index: number, level: LevelFormData | SavedLevel, levelId?: string) => {
    setCurrentLevel({
      name: level.name,
      description: level.description || '',
      orderIndex: (level as SavedLevel).orderIndex ?? index,
      durationWeeks: level.durationWeeks,
      learningOutcomes: level.learningOutcomes || [],
      prerequisites: level.prerequisites || [],
      isOptional: level.isOptional || false,
    });
    setEditingLevelIndex(levelId ? null : index);
    setEditingLevelId(levelId || null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, []);

  const handleCancelEdit = useCallback(() => { resetLevelForm(); }, [resetLevelForm]);

  const handleSaveLevels = useCallback(async () => {
    const totalLevels = createdLevels.length + levels.length;
    if (totalLevels === 0) { toast.error('Please add at least one level'); return; }
    if (levels.length > 0 && createdProgramId) {
      try {
        setLoading(true);
        const saved: SavedLevel[] = [];
        for (const level of levels) {
          const response = (await programManagementApi.levels.create(createdProgramId, level)) as {
            data?: { level?: SavedLevel };
            level?: SavedLevel;
          };
          saved.push(response.data?.level ?? response.level ?? ({ ...level } as SavedLevel));
        }
        setCreatedLevels((prev) => [...prev, ...saved]);
        setLevels([]);
      } catch (err: unknown) {
        toast.error(extractApiErrorMessage(err, 'Failed to save levels'));
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }
    router.push(`/admin/programs/create?programId=${createdProgramId}&step=3`);
    setCurrentStep(3);
  }, [createdLevels, levels, createdProgramId, router]);

  // ── Step 3 ────────────────────────────────────────────────────────────────────
  const handleGenerateRoadmap = useCallback(async (levelIndex: number) => {
    try {
      setGeneratingRoadmap(true);
      setSelectedLevelForRoadmap(levelIndex);
      const level = createdLevels[levelIndex];
      if (!level?.id) throw new Error('Level ID is missing. Please refresh and try again.');
      await programManagementApi.roadmaps.generate(createdProgramId!, level.id, roadmapInstructions);
      toast.success(`AI Roadmap generated for "${level.name}"`);
      setRoadmapInstructions('');
      setSelectedLevelForRoadmap(null);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to generate roadmap'));
    } finally {
      setGeneratingRoadmap(false);
    }
  }, [createdLevels, createdProgramId, roadmapInstructions]);

  const handleFinish = useCallback(() => {
    toast.success('Program Created Successfully! 🎉');
    router.push(`/admin/programs/${createdProgramId}`);
  }, [createdProgramId, router]);

  const goBack = useCallback(() => setCurrentStep((s) => Math.max(1, s - 1)), []);

  return {
    currentStep, loading, createdProgramId, createdLevels,
    programData, setProgramData,
    tagInput, setTagInput, addTag, removeTag,
    outcomeInput, setOutcomeInput, addOutcome, removeOutcome,
    prerequisiteInput, setPrerequisiteInput, addPrerequisite, removePrerequisite,
    handleCreateProgram,
    levels, currentLevel, setCurrentLevel, editingLevelIndex, editingLevelId,
    levelOutcomeInput, setLevelOutcomeInput, addLevelOutcome, removeLevelOutcome,
    levelPrerequisiteInput, setLevelPrerequisiteInput, addLevelPrerequisite, removeLevelPrerequisite,
    handleAddLevel, handleRemoveLevel, handleEditLevel, handleCancelEdit, handleSaveLevels,
    selectedLevelForRoadmap, roadmapInstructions, setRoadmapInstructions,
    generatingRoadmap, handleGenerateRoadmap, handleFinish, goBack,
  };
}
