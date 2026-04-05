'use client';

import { useState, useEffect, useCallback } from 'react';
import { roadmapsApi } from '@/lib/services/program-api';
import { toast } from 'sonner';

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

  const fetchRoadmapTasks = useCallback(async () => {
    // Don't fetch if not enabled or missing required params
    if (!enabled || !programId || !levelId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await roadmapsApi.getByLevel(programId, levelId);
      
      // Extract tasks from weeks
      const roadmapTasks: RoadmapTaskOption[] = [];
      
      if (response?.data?.weeks && Array.isArray(response.data.weeks)) {
        response.data.weeks.forEach((week: { id: string; weekNumber: number; tasks?: { id: string; title: string; description?: string; estimatedHours?: number }[] }) => {
          if (week.tasks && Array.isArray(week.tasks)) {
            week.tasks.forEach((task: { id: string; title: string; description?: string; estimatedHours?: number }) => {
              roadmapTasks.push({
                id: task.id,
                weekId: week.id,
                title: task.title || 'Untitled Task',
                description: task.description || '',
                estimatedHours: task.estimatedHours,
                week: { weekNumber: week.weekNumber },
              });
            });
          }
        });
      }

      setTasks(roadmapTasks);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load roadmap tasks';
      setError(errorMessage);
      toast.error(errorMessage);
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, [programId, levelId, enabled]);

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
