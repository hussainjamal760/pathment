import { useCallback, useEffect, useState } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';
import { submissionService } from '@/lib/services/submissionService';

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
  isExtensionRequest: boolean;
  extensionReason: string | null;
  extensionDays: number | null;
  dueDate: string | null;
  menteeTimezone: string | null;
}

export interface UseMentorApprovalsReturn {
  queue: ApprovalItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  bulkApprove: (submissionIds: string[]) => Promise<void>;
  handleExtension: (submissionId: string, approved: boolean, newDueDate?: string) => Promise<void>;
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

  const handleExtension = useCallback(async (submissionId: string, approved: boolean, newDueDate?: string) => {
    await submissionService.handleExtension(submissionId, approved, newDueDate);
    await fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return { queue, loading, error, refetch: fetchQueue, bulkApprove, handleExtension };
}
