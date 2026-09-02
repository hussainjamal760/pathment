'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { certificatesApi, AIEvaluationResult } from '@/lib/services/certificates-api';
import { getSocket } from '@/lib/services/socket-client';

interface UseAIEvaluationProgressOptions {
  templateId: string | null;
  onIncrementalResult?: (result: AIEvaluationResult) => void;
  onCompleteResults?: (results: AIEvaluationResult[], ranAt: string) => void;
}

/**
 * Custom hook to handle real-time AI evaluation progress via Socket.IO,
 * polling fallback, background queue status, and auto-resume on mount.
 */
export function useAIEvaluationProgress({
  templateId,
  onIncrementalResult,
  onCompleteResults
}: UseAIEvaluationProgressOptions) {
  const [runningAI, setRunningAI] = useState(false);
  const [aiRanAt, setAiRanAt] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<AIEvaluationResult[]>([]);
  const [aiProgressCount, setAiProgressCount] = useState(0);
  const [aiTotalCount, setAiTotalCount] = useState(0);
  const [aiEvaluationRunId, setAiEvaluationRunId] = useState<string | null>(null);

  // Auto-detect active evaluation run on mount / templateId load
  useEffect(() => {
    if (!templateId) return;

    const checkActiveRun = async () => {
      try {
        const statusRes: any = await certificatesApi.getAIEvaluationStatus(templateId);
        if (statusRes.success) {
          const payload = statusRes.data?.data ? statusRes.data : statusRes;
          const activeRunId = payload.runId || statusRes.runId;
          const isDone = payload.isDone ?? statusRes.isDone ?? true;
          const completed = payload.completed ?? statusRes.completed ?? 0;
          const total = payload.total ?? statusRes.total ?? 0;

          if (!isDone && activeRunId) {
            setAiEvaluationRunId(activeRunId);
            setRunningAI(true);
            setAiProgressCount(completed);
            setAiTotalCount(total);
          }
        }
      } catch (e) {
        // Silently ignore status check error on mount
      }
    };

    checkActiveRun();
  }, [templateId]);

  // Listen to Socket.IO & Polling fallback when an evaluation run is active
  useEffect(() => {
    if (!aiEvaluationRunId || !templateId) return;

    const socket = getSocket();
    let pollInterval: NodeJS.Timeout | null = null;

    const handleProgress = (data: { runId: string; menteeId: string; result: any; completed: number; total: number }) => {
      if (data.runId !== aiEvaluationRunId) return;
      setAiProgressCount(data.completed);
      setAiTotalCount(data.total);

      setAiResults(prev => {
        const index = prev.findIndex(r => r.mentee_id === data.result.mentee_id);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = data.result;
          return updated;
        } else {
          return [...prev, data.result];
        }
      });

      onIncrementalResult?.(data.result);
    };

    const handleComplete = (data: { runId: string; results: any[]; ranAt: string }) => {
      if (data.runId !== aiEvaluationRunId) return;
      const resList = data.results || [];
      setAiResults(resList);
      setAiRanAt(data.ranAt);
      setRunningAI(false);
      setAiEvaluationRunId(null);

      onCompleteResults?.(resList, data.ranAt);
      toast.success(`AI evaluation completed successfully for ${resList.length} mentees!`);
    };

    if (socket) {
      socket.on('ai-eval:progress', handleProgress);
      socket.on('ai-eval:complete', handleComplete);
    }

    // Polling fallback
    pollInterval = setInterval(async () => {
      try {
        const res: any = await certificatesApi.getAIEvaluationStatus(templateId, aiEvaluationRunId);
        if (res.success) {
          const payload = res.data?.data ? res.data : res;
          const completed = payload.completed ?? res.completed ?? 0;
          const total = payload.total ?? res.total ?? 0;
          const isDone = payload.isDone ?? res.isDone ?? false;
          const resultsList = payload.data ?? res.data ?? [];

          setAiProgressCount(completed);
          setAiTotalCount(total);

          if (Array.isArray(resultsList) && resultsList.length > 0) {
            setAiResults(resultsList);
            onCompleteResults?.(resultsList, payload.ranAt || res.ranAt || new Date().toISOString());
          }

          if (isDone) {
            const finalRanAt = payload.ranAt || res.ranAt || new Date().toISOString();
            setAiRanAt(finalRanAt);
            setRunningAI(false);
            setAiEvaluationRunId(null);
            if (pollInterval) clearInterval(pollInterval);
            toast.success(`AI evaluation completed successfully!`);
          }
        }
      } catch (err) {
        console.error('AI status poll error:', err);
      }
    }, 4000);

    return () => {
      if (socket) {
        socket.off('ai-eval:progress', handleProgress);
        socket.off('ai-eval:complete', handleComplete);
      }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [aiEvaluationRunId, templateId, onIncrementalResult, onCompleteResults]);

  // Trigger AI evaluation batch run
  const triggerAIEvaluation = async (mentorId?: string) => {
    if (!templateId) return;

    try {
      setRunningAI(true);
      setAiProgressCount(0);

      const res = await certificatesApi.runAIEvaluation(templateId, mentorId);
      const total = res.total ?? (res as any).data?.total ?? 0;
      const runId = res.runId || (res as any).data?.runId;

      if (total === 0) {
        toast.info('No active mentees found to evaluate');
        setRunningAI(false);
        return;
      }

      setAiTotalCount(total);

      if (runId) {
        setAiEvaluationRunId(runId);
        toast.success(`AI evaluation queued for ${total} mentee(s). Evaluating in real-time...`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start AI evaluation');
      setRunningAI(false);
    }
  };

  const aiEvalMap = useMemo(() => {
    const map: Record<string, any> = {};
    (aiResults || []).forEach(r => { map[r.mentee_id] = r; });
    return map;
  }, [aiResults]);

  return {
    runningAI,
    aiRanAt,
    setAiRanAt,
    aiResults,
    setAiResults,
    aiProgressCount,
    aiTotalCount,
    aiEvaluationRunId,
    triggerAIEvaluation,
    aiEvalMap
  };
}
