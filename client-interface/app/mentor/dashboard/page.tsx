'use client';

import Link from 'next/link';
import {
  Users, ClipboardList, Star, Clock, CheckCircle2, Loader2,
  BookOpen, TrendingUp, Bell, MessageSquare, Zap, ArrowRight,
  FileText, MessagesSquare,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useMentorDashboard } from '@/lib/hooks/mentor';
import { StatsCard, ProgressBar } from '@/components/admin/ui';
import { formatRelativeTime } from '@/lib/utils/date';
import type { NotificationItem } from '@/lib/types/messaging';

// ─── Notification icon helper ────────────────────────────────────────────────
function NotificationIcon({ type }: { type: NotificationItem['type'] }) {
  const map: Record<NotificationItem['type'], { Icon: React.ElementType; bg: string; text: string }> = {
    task:      { Icon: ClipboardList,   bg: 'bg-indigo-50',  text: 'text-indigo-600' },
    feedback:  { Icon: MessageSquare,   bg: 'bg-green-50',   text: 'text-green-600'  },
    badge:     { Icon: Star,            bg: 'bg-yellow-50',  text: 'text-yellow-600' },
    milestone: { Icon: TrendingUp,      bg: 'bg-purple-50',  text: 'text-purple-600' },
    message:   { Icon: MessagesSquare,  bg: 'bg-blue-50',    text: 'text-blue-600'   },
    system:    { Icon: Bell,            bg: 'bg-slate-100',  text: 'text-slate-600'  },
    challenge: { Icon: Zap,             bg: 'bg-orange-50',  text: 'text-orange-600' },
  };
  const { Icon, bg, text } = map[type] ?? map.system;
  return (
    <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
      <Icon className={`w-4 h-4 ${text}`} />
    </div>
  );
}

// ─── Difficulty badge ────────────────────────────────────────────────────────
function DifficultyBadge({ difficulty }: { difficulty?: string }) {
  const map: Record<string, string> = {
    easy:   'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    hard:   'bg-red-100 text-red-700',
  };
  const key = (difficulty ?? 'medium').toLowerCase();
  return (
    <span className={`px-2 py-0.5 rounded text-xs capitalize ${map[key] ?? map.medium}`}>
      {key}
    </span>
  );
}

export default function MentorDashboard() {
  const { user } = useAuth();
  const {
    activeMentees,
    programsCount,
    loading,
    taskStats,
    statsLoading,
    pendingReviews,
    reviewsLoading,
    recentNotifications,
  } = useMentorDashboard();

  const pendingReviewsCount: number =
    taskStats?.pendingReview ?? taskStats?.submitted ?? pendingReviews.length;

  const avgRating: string = taskStats?.averageRating
    ? Number(taskStats.averageRating).toFixed(1)
    : '—';

  const completedTasks: number = taskStats?.completed ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
        </h1>
        <p className="text-slate-600">Guide and support your mentees on their learning journey</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          icon={Users}
          label="Active Mentees"
          value={loading ? '…' : activeMentees.length}
          colorClass="text-indigo-600 bg-indigo-50"
        />
        <StatsCard
          icon={BookOpen}
          label="Programs"
          value={loading ? '…' : programsCount}
          colorClass="text-blue-600 bg-blue-50"
        />
        <StatsCard
          icon={Clock}
          label="Pending Reviews"
          value={statsLoading ? '…' : pendingReviewsCount}
          colorClass="text-yellow-600 bg-yellow-50"
        />
        <StatsCard
          icon={Star}
          label="Avg. Rating"
          value={statsLoading ? '…' : avgRating}
          colorClass="text-purple-600 bg-purple-50"
        />
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* ── Left Column ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* My Mentees */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-slate-900">My Mentees</h2>
              <Link href="/mentor/mentees" className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : activeMentees.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 mb-2">No active mentees yet</p>
                <p className="text-slate-500 text-sm">You&apos;ll see your mentees here once admin assigns them to you</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {activeMentees.slice(0, 5).map((match) => {
                  const mentee     = match.mentee;
                  const enrollment = match.enrollment;
                  const progress   = parseFloat(enrollment?.overallProgressPercentage) || 0;
                  return (
                    <div key={match.id} className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-indigo-700 font-medium text-sm">
                              {mentee?.firstName?.[0]}{mentee?.lastName?.[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {mentee?.firstName} {mentee?.lastName}
                            </p>
                            <p className="text-slate-500 text-sm truncate">
                              {enrollment?.program?.name || 'Unknown Program'}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                              <span>Week {enrollment?.currentWeek || 1}</span>
                              <span>·</span>
                              <span>{match?.level?.name || enrollment?.currentLevel?.name || 'Level 1'}</span>
                              <span>·</span>
                              <span>{progress}% complete</span>
                            </div>
                          </div>
                        </div>
                        <Link
                          href={`/mentor/mentees/${mentee?.id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-700 shrink-0 ml-2"
                        >
                          View
                        </Link>
                      </div>
                      <ProgressBar value={progress} size="sm" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-slate-900">Recent Activity</h2>
              <Link href="/mentor/notifications" className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentNotifications.length === 0 ? (
              <div className="p-6 text-center py-10">
                <Bell className="w-11 h-11 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">No recent activity</p>
                <p className="text-slate-500 text-xs mt-1">Task submissions and updates will appear here</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentNotifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 px-6 py-4">
                    <NotificationIcon type={n.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{n.message}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 mt-0.5">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Pending Reviews */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">Pending Reviews</h3>
                {pendingReviewsCount > 0 && (
                  <span className="min-w-5 h-5 px-1 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs font-medium">
                    {pendingReviewsCount}
                  </span>
                )}
              </div>
              {pendingReviews.length > 0 && (
                <Link href="/mentor/tasks?tab=pending" className="text-indigo-600 hover:text-indigo-700 text-xs flex items-center gap-1">
                  View All <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>

            {reviewsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : pendingReviews.length === 0 ? (
              <div className="p-6 text-center py-8">
                <CheckCircle2 className="w-11 h-11 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">All caught up!</p>
                <p className="text-slate-500 text-xs mt-1">Submitted tasks will appear here</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendingReviews.slice(0, 5).map((task) => (
                  <li key={task.id} className="px-6 py-4">
                    <div className="flex items-start gap-2 mb-1">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-slate-800 line-clamp-1 flex-1">{task.title}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {task.mentee?.firstName} {task.mentee?.lastName}
                        </span>
                        <DifficultyBadge difficulty={task.difficulty} />
                      </div>
                      <Link
                        href={`/mentor/tasks/${task.id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Review
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href="/mentor/tasks"
                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 text-indigo-600" />
                </div>
                <span className="text-sm text-slate-700">Manage Tasks</span>
              </Link>
              <Link
                href="/mentor/mentees"
                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-sm text-slate-700">View All Mentees</span>
              </Link>
              <Link
                href="/mentor/messages"
                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <MessagesSquare className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm text-slate-700">Messages</span>
              </Link>
              <Link
                href="/mentor/programs"
                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-sm text-slate-700">My Programs</span>
              </Link>
            </div>
          </div>

          {/* Performance Summary */}
          <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-indigo-900 mb-1">Your Performance</h3>
            <p className="text-indigo-700 text-sm mb-4">
              {activeMentees.length > 0
                ? `Guiding ${activeMentees.length} mentee${activeMentees.length > 1 ? 's' : ''} to success`
                : 'Ready to start mentoring when mentees are assigned'}
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-indigo-700 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 fill-indigo-500 text-indigo-500" />
                  Avg. Rating
                </span>
                <span className="font-semibold text-indigo-900">{avgRating}{avgRating !== '—' ? ' / 5.0' : ''}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-indigo-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                  Tasks Reviewed
                </span>
                <span className="font-semibold text-indigo-900">{statsLoading ? '…' : completedTasks}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
