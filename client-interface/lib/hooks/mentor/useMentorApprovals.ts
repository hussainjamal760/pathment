import { useCallback, useEffect, useState } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';

export interface ApprovalItem {
  submissionId: string;
  taskId: string;
  version: number;
  submissionText: string;
  submissionUrls: string[];
  submittedAt: string;
  isLate: boolean;
  title: string;
  type: string | null;
  brief: string | null;
  deliverable: string | null;
  criteria: string[];
  maxPoints: number;
  mentee: { id: string; name: string; avatar: string } | null;
}

export interface UseMentorApprovalsReturn {
  queue: ApprovalItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  bulkApprove: (submissionIds: string[]) => Promise<void>;
}

export function useMentorApprovals(): UseMentorApprovalsReturn {
  const [queue, setQueue] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await mentorApi.getApprovals();
      setQueue(res?.data?.queue ?? []);
    } catch {
      setError('Failed to load the approvals queue');
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const bulkApprove = useCallback(async (submissionIds: string[]) => {
    await mentorApi.bulkApprove(submissionIds);
    await fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return { queue, loading, error, refetch: fetchQueue, bulkApprove };
}
