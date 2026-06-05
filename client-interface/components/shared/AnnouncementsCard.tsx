'use client';

import Link from 'next/link';
import { Megaphone, Pin, ArrowRight } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/shared/useAnnouncements';

/** Compact "Latest announcements" card for dashboards. Links to the full feed. */
export function AnnouncementsCard({ href, limit = 3 }: { href: string; limit?: number }) {
  const { announcements, loading } = useAnnouncements();
  if (loading || announcements.length === 0) return null;
  const items = announcements.slice(0, limit);

  return (
    <div className="bg-white rounded-2xl border border-slate-200">
      <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-slate-900 flex items-center gap-2"><Megaphone className="w-4 h-4 text-brand-600" /> Announcements</h2>
        <Link href={href} className="text-brand-600 hover:text-brand-700 text-sm flex items-center gap-1">
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((a) => (
          <Link key={a.id} href={href} className="block px-6 py-3.5 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2">
              {a.pinned && <Pin className="w-3.5 h-3.5 text-brand-500 shrink-0" />}
              <p className="text-sm font-medium text-slate-900 truncate">{a.title}</p>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{a.body}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{a.author?.name ? `${a.author.name} · ` : ''}to {a.audienceLabel}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
