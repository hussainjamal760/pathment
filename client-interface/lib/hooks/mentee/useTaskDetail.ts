/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { taskApi } from '@/lib/services/task-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface UseTaskDetailReturn {
  task: any;
  loading: boolean;
  error: string;
  refetch: () => Promise<void>;
}

export function useTaskDetail(taskId: string): UseTaskDetailReturn {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      setError('');
      const response = await taskApi.getTaskById(taskId);
      setTask(response.data.task);
    } catch (err: any) {
      const msg = extractApiErrorMessage(err, 'Failed to load task');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  return { task, loading, error, refetch: fetchTask };
}
