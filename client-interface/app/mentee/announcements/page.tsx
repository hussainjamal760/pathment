'use client';

import { Megaphone } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/shared/useAnnouncements';
import { AnnouncementFeed } from '@/components/shared/AnnouncementFeed';

export default function MenteeAnnouncements() {
  const { announcements, loading, error, refetch } = useAnnouncements();
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-2 flex items-center gap-2"><Megaphone className="w-5 h-5 text-brand-600" /> Announcements</h1>
        <p className="text-slate-600">Updates from your mentor, your program, and the team.</p>
      </div>
      <AnnouncementFeed
        announcements={announcements}
        loading={loading}
        error={error}
        onRefresh={refetch}
        emptyHint="No announcements yet — your mentor and admins will post here."
      />
    </div>
  );
}
