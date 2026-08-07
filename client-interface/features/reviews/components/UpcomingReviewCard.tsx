'use client';

import { useEffect, useState, useCallback } from 'react';
import { Calendar, User, Users, Sparkles } from 'lucide-react';
import { menteeApi } from '@/lib/services/mentee-api';
import { useCountdown } from '@/lib/hooks/useCountdown';
import { CountdownTicker } from '@/components/shared/CountdownTicker';
import { formatMeeting } from '@/lib/utils/datetime';

interface UpcomingReview {
  scheduleId: string;
  title: string;
  scheduledAt: string;
  clanName: string;
  mentorName: string;
  durationMinutes: number;
}

export function UpcomingReviewCard() {
  const [upcoming, setUpcoming] = useState<UpcomingReview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUpcoming = useCallback(async () => {
    try {
      const res = (await menteeApi.getUpcomingReview()) as {
        data?: { upcoming: UpcomingReview | null };
      };
      setUpcoming(res?.data?.upcoming ?? null);
    } catch {
      setUpcoming(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpcoming();
    const interval = setInterval(fetchUpcoming, 30_000);
    return () => clearInterval(interval);
  }, [fetchUpcoming]);

  const timeLeft = useCountdown(upcoming?.scheduledAt);

  if (loading || !upcoming || timeLeft.isExpired) {
    return null;
  }

  const formattedDate = formatMeeting(upcoming.scheduledAt);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white shadow-xl mb-6">
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left Side: Information */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-xs font-medium text-brand-300 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-brand-300 animate-pulse" />
            <span>Upcoming Cohort Review</span>
          </div>

          <h3 className="text-xl font-bold tracking-tight text-white">
            {upcoming.title}
          </h3>

          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-300">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-brand-400" />
              {upcoming.clanName}
            </span>
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-brand-400" />
              Mentor: {upcoming.mentorName}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-brand-400" />
              {formattedDate}
            </span>
          </div>
        </div>

        {/* Right Side: Reusable Live Countdown Ticker */}
        <div className="self-start md:self-auto">
          <CountdownTicker timeLeft={timeLeft} />
        </div>
      </div>
    </div>
  );
}
