'use client';

import { type ComponentType, useEffect, useMemo, useState } from 'react';
import {
  Award,
  Flame,
  Loader2,
  Medal,
  Star,
  Target,
  Trophy,
  Users
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import {
  gamificationApi,
  type Badge,
  type GamificationStats,
  type LeaderboardEntry,
  type PointsHistoryEntry
} from '@/lib/services/gamification-api';

type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

export default function MenteeGamificationPage() {
  const { user } = useAuth();

  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [history, setHistory] = useState<PointsHistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<LeaderboardPeriod>('all_time');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [statsRes, badgesRes, historyRes, leaderboardRes] = await Promise.all([
          gamificationApi.getUserStats(user.id),
          gamificationApi.getUserBadges(user.id),
          gamificationApi.getUserPointsHistory(user.id, 12),
          gamificationApi.getLeaderboard(period, 10)
        ]);

        if (!mounted) return;
        setStats(statsRes);
        setBadges(badgesRes);
        setHistory(historyRes);
        setLeaderboard(leaderboardRes);
      } catch (e: unknown) {
        if (!mounted) return;

        setError(extractApiErrorMessage(e, 'Failed to load gamification data'));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [user?.id, period]);

  const levelProgress = useMemo(() => {
    const points = stats?.totalPoints || 0;
    const currentLevel = stats?.currentLevel || 1;

    const thresholds = [0, 500, 2000, 5000, 10000];
    const currentFloor = thresholds[Math.min(currentLevel - 1, thresholds.length - 1)] || 0;
    const nextThreshold = thresholds[Math.min(currentLevel, thresholds.length - 1)] || currentFloor;

    if (nextThreshold === currentFloor) {
      return { percent: 100, pointsToNext: 0 };
    }

    const progress = ((points - currentFloor) / (nextThreshold - currentFloor)) * 100;
    return {
      percent: Math.max(0, Math.min(100, Math.round(progress))),
      pointsToNext: Math.max(0, nextThreshold - points)
    };
  }, [stats]);

  if (!user?.id) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error || 'Could not load gamification data'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-200 bg-linear-to-r from-indigo-50 to-cyan-50 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-slate-900 mb-2">Your Progress Arena</h1>
            <p className="text-slate-600">Track points, climb levels, and unlock badges.</p>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 border border-indigo-200">
            <div className="text-xs text-slate-500">Global Rank</div>
            <div className="text-2xl font-semibold text-indigo-700">
              {stats.leaderboardRank ? `#${stats.leaderboardRank}` : 'Unranked'}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
            <span>Level {stats.currentLevel}</span>
            <span>{levelProgress.pointsToNext} pts to next level</span>
          </div>
          <div className="h-3 w-full rounded-full bg-white/80 border border-indigo-100 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-indigo-600 to-cyan-500 transition-all"
              style={{ width: `${levelProgress.percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Trophy} label="Total Points" value={stats.totalPoints} accent="text-amber-600" />
        <StatCard icon={Flame} label="Current Streak" value={`${stats.currentStreak} days`} accent="text-orange-600" />
        <StatCard icon={Target} label="Tasks Completed" value={stats.totalTasksCompleted} accent="text-emerald-600" />
        <StatCard icon={Star} label="Average Rating" value={Number(stats.avgTaskRating || 0).toFixed(2)} accent="text-indigo-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-slate-900">Top Leaderboard</h2>
            <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
              {(['daily', 'weekly', 'monthly', 'all_time'] as LeaderboardPeriod[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setPeriod(option)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    period === option ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {option === 'all_time' ? 'All Time' : option[0].toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {leaderboard.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
                Leaderboard is empty right now.
              </div>
            )}
            {leaderboard.map((entry) => {
              const name = [entry.user?.firstName, entry.user?.lastName].filter(Boolean).join(' ').trim() || entry.user?.email || 'User';
              const isCurrentUser = entry.userId === user.id;

              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between rounded-xl border p-3 ${
                    isCurrentUser ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-semibold">
                      {entry.rank}
                    </div>
                    <div className="min-w-0">
                      <p className="text-slate-900 truncate">{name}</p>
                      {isCurrentUser && <p className="text-indigo-700 text-xs">You</p>}
                    </div>
                  </div>
                  <div className="text-slate-700 font-medium">{entry.points} pts</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-indigo-600" />
            <h2 className="text-slate-900">Recent Badges</h2>
          </div>

          <div className="space-y-3">
            {badges.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-slate-500 text-sm">
                No badges yet. Complete tasks to unlock achievements.
              </div>
            )}

            {badges.slice(0, 6).map((badge) => (
              <div key={badge.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-slate-900">{badge.name}</p>
                    <p className="text-slate-600 text-sm mt-1">{badge.description}</p>
                  </div>
                  <Medal className="w-5 h-5 text-amber-500 shrink-0" />
                </div>
                <div className="text-xs text-slate-500 mt-2 capitalize">{badge.category}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-indigo-600" />
          <h2 className="text-slate-900">Points History</h2>
        </div>

        <div className="space-y-2">
          {history.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
              No points awarded yet.
            </div>
          )}

          {history.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
              <div className="min-w-0">
                <p className="text-slate-900 truncate">{item.reason || item.sourceType}</p>
                <p className="text-slate-500 text-xs">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
              <div className="text-emerald-600">+{item.pointsChange}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm">{label}</p>
          <p className="text-slate-900 text-2xl mt-1">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <Icon className={`w-5 h-5 ${accent}`} />
        </div>
      </div>
    </div>
  );
}
