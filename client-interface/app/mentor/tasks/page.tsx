'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * The mentor task/review queue was replaced by Approvals. Redirect to keep
 * old links working. (Task detail / assign / feedback pages remain.)
 */
export default function MentorTasksRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/mentor/approvals'); }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
    </div>
  );
}
