'use client';

import { useCallback, useEffect, useState } from 'react';
import { orgRoadmapApi, type RoadmapStepInput } from '@/lib/services/roadmap-api';

export interface OrgRoadmapStep {
  id: string;
  title: string;
  description?: string;
  type: string;
  taskOrder: number;
  effort?: string | null;
  dueOffsetDays?: number | null;
  acceptanceCriteria?: string[];
  difficulty?: string | null;
  deliverable?: string | null;
  pointsBase?: number | null;
  resources?: { id?: string; title: string; url: string; resourceType?: string | null }[];
}

export interface OrgRoadmap {
  id: string;
  name: string;
  description?: string | null;
  source: 'org';
  published: boolean;
  skillTags: string[];
  programId: string;
  steps: OrgRoadmapStep[];
}

export interface UseOrgRoadmapsReturn {
  roadmaps: OrgRoadmap[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (data: { name: string; programId: string; description?: string; skillTags?: string[]; steps: RoadmapStepInput[]; published?: boolean }) => Promise<void>;
  update: (id: string, data: { name?: string; description?: string; skillTags?: string[]; published?: boolean }) => Promise<void>;
  addStep: (id: string, step: RoadmapStepInput) => Promise<void>;
  replaceSteps: (id: string, steps: RoadmapStepInput[]) => Promise<void>;
  removeStep: (id: string, stepId: string) => Promise<void>;
  setPublished: (id: string, published: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useOrgRoadmaps(): UseOrgRoadmapsReturn {
  const [roadmaps, setRoadmaps] = useState<OrgRoadmap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await orgRoadmapApi.list();
      setRoadmaps(res?.data?.roadmaps ?? []);
    } catch {
      setError('Failed to load org roadmaps');
      setRoadmaps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (data: Parameters<typeof orgRoadmapApi.create>[0]) => {
    await orgRoadmapApi.create(data);
    await fetchAll();
  }, [fetchAll]);

  const update = useCallback(async (id: string, data: { name?: string; description?: string; skillTags?: string[]; published?: boolean }) => {
    await orgRoadmapApi.update(id, data);
    await fetchAll();
  }, [fetchAll]);

  const addStep = useCallback(async (id: string, step: RoadmapStepInput) => {
    await orgRoadmapApi.addStep(id, step);
    await fetchAll();
  }, [fetchAll]);

  const replaceSteps = useCallback(async (id: string, steps: RoadmapStepInput[]) => {
    await orgRoadmapApi.replaceSteps(id, steps);
    await fetchAll();
  }, [fetchAll]);

  const removeStep = useCallback(async (id: string, stepId: string) => {
    await orgRoadmapApi.removeStep(id, stepId);
    await fetchAll();
  }, [fetchAll]);

  const setPublished = useCallback(async (id: string, published: boolean) => {
    await orgRoadmapApi.update(id, { published });
    await fetchAll();
  }, [fetchAll]);

  const remove = useCallback(async (id: string) => {
    await orgRoadmapApi.remove(id);
    await fetchAll();
  }, [fetchAll]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { roadmaps, loading, error, refetch: fetchAll, create, update, addStep, replaceSteps, removeStep, setPublished, remove };
}
