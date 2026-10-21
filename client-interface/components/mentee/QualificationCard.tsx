'use client';

import Link from 'next/link';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { useMyQualification } from '@/lib/hooks/mentee/useMyQualification';

/** A way in for candidates still being selected. Renders nothing for anybody else. */
export function QualificationCard() {
  const { pools } = useMyQualification();
  const live = pools.filter((p) => !p.placedClan);
  if (!live.length) return null;
  const open = live.flatMap((p) => p.tasks).filter((t) => !['completed', 'submitted'].includes(t.status)).length;
  return (
    <Link href="/mentee/qualification" className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 hover:border-brand-300">
      <ClipboardCheck className="w-6 h-6 text-brand-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{live.map((p) => p.pool.name).join(', ')}</p>
        <p className="text-xs text-slate-600">{open ? `${open} piece(s) of qualification work to do` : 'Your qualification work is in. We will let you know the outcome.'}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-brand-600" />
    </Link>
  );
}
