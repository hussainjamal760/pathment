'use client';

import { useState, useEffect, useCallback } from 'react';

export interface RoadmapTaskOption {
  id: string;
  weekId: string;
  title: string;
  description: string;
  estimatedHours?: number;
  week?: { weekNumber: number };
}

interface UseRoadmapTasksParams {
  programId?: string;
  levelId?: string;
  enabled?: boolean; // Only fetch when enabled
}

interface UseRoadmapTasksReturn {
  tasks: RoadmapTaskOption[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRoadmapTasks({
  programId,
  levelId,
  enabled = true,
}: UseRoadmapTasksParams): UseRoadmapTasksReturn {
  const [tasks, setTasks] = useState<RoadmapTaskOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Legacy week-based roadmap-task picker was removed. Mentors now author/assign
  // linear roadmaps (Roadmaps area) and one-off tasks (assign drawer), so this
  // returns no week-based options.
  const fetchRoadmapTasks = useCallback(async () => {
    setTasks([]);
    setIsLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    fetchRoadmapTasks();
  }, [fetchRoadmapTasks]);

  return {
    tasks,
    isLoading,
    error,
    refetch: fetchRoadmapTasks,
  };
}
