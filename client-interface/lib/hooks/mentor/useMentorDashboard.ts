/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { matchingApi } from '@/lib/services/enrollment-api';
import { taskApi } from '@/lib/services/task-api';
import { messagingApi } from '@/lib/services/messaging-api';
import { useAuth } from '@/lib/context/AuthContext';
import type { NotificationItem } from '@/lib/types/messaging';
import { toast } from 'sonner';

export interface UseMentorDashboardReturn {
  matches: any[];
  activeMentees: any[];
  programsCount: number;
  loading: boolean;
  taskStats: any;
  statsLoading: boolean;
  pendingReviews: any[];
  reviewsLoading: boolean;
  recentNotifications: NotificationItem[];
  fetchMyMatches: () => Promise<void>;
  refetchAll: () => void;
}

export function useMentorDashboard(): UseMentorDashboardReturn {
  const { user } = useAuth();

  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskStats, setTaskStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchMyMatches = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const response = await matchingApi.getMatches({ mentorId: user.id, status: 'active' });
      setMatches(response?.data?.matches || response?.matches || []);
    } catch (error: any) {
      console.error('Failed to fetch matches:', error);
      toast.error('Failed to load your mentees');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchTaskStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      setStatsLoading(true);
      const res = await taskApi.getMentorTaskStats(user.id);
      setTaskStats(res?.data?.stats || null);
    } catch {
      // non-critical — silently ignore
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id]);

  const fetchPendingReviews = useCallback(async () => {
    if (!user?.id) return;
    try {
      setReviewsLoading(true);
      const res = await taskApi.getMentorTasks(user.id, { pendingReview: true });
      setPendingReviews(res?.data?.tasks || []);
    } catch {
      // non-critical
    } finally {
      setReviewsLoading(false);
    }
  }, [user?.id]);

  const fetchRecentNotifications = useCallback(async () => {
    try {
      const { notifications } = await messagingApi.listNotifications(6);
      setRecentNotifications(notifications);
    } catch {
      // non-critical
    }
  }, []);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return;
    fetchMyMatches();
    fetchTaskStats();
    fetchPendingReviews();
    fetchRecentNotifications();
  }, [user?.id, fetchMyMatches, fetchTaskStats, fetchPendingReviews, fetchRecentNotifications]);

  const refetchAll = useCallback(() => {
    fetchMyMatches();
    fetchTaskStats();
    fetchPendingReviews();
    fetchRecentNotifications();
  }, [fetchMyMatches, fetchTaskStats, fetchPendingReviews, fetchRecentNotifications]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeMentees = useMemo(
    () => matches.filter((m) => m.status === 'active'),
    [matches]
  );

  const programsCount = useMemo(
    () => [...new Set(matches.map((m) => m.enrollment?.program?.id))].filter(Boolean).length,
    [matches]
  );

  return {
    matches,
    activeMentees,
    programsCount,
    loading,
    taskStats,
    statsLoading,
    pendingReviews,
    reviewsLoading,
    recentNotifications,
    fetchMyMatches,
    refetchAll,
  };
}
