'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { qk, useApiQuery } from '@/lib/query';
import { poolsApi } from '@/lib/services/pools-api';
import { ReviewDrawer } from '@/components/mentor/ReviewDrawer';
import { InterviewReviewDrawer } from '@/components/mentor/InterviewReviewDrawer';
import { QuizReviewDrawer } from '@/components/mentor/QuizReviewDrawer';
import type { ApprovalItem } from '@/lib/hooks/mentor/useMentorApprovals';

/**
 * Qualification work waiting on a reviewer. The same review drawers mentors
 * use (work, quiz, interview), so feedback, criteria and "request changes"
 * behave exactly as they do for clan work; the server checks pool.review.
 */
export function ReviewsTab({ poolId, onReviewed }: { poolId: string; onReviewed: () => void }) {
  const [reviewing, setReviewing] = useState<ApprovalItem | null>(null);
  const { data: items, loading, refetch } = useApiQuery<ApprovalItem[]>({
    queryKey: qk.admin.poolReviews(poolId),
    queryFn: async () => (await poolsApi.reviews(poolId))?.data?.items ?? [],
    errorMessage: 'Failed to load the review queue',
  });

  const done = () => { setReviewing(null); refetch(); onReviewed(); };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  if (!items?.length) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
        <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">Nothing waiting for review</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {items.map((item) => (
          <button key={item.submissionId} onClick={() => setReviewing(item)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
              <p className="text-xs text-slate-500">{item.mentee?.name} · v{item.version}{item.isLate ? ' · late' : ''}</p>
            </div>
            <span className="text-xs font-medium text-brand-600">Review</span>
          </button>
        ))}
      </div>
      {reviewing?.type === 'interview' && (
        <InterviewReviewDrawer taskId={reviewing.taskId} allowAi={false} onClose={() => setReviewing(null)} onFinalized={done} />
      )}
      {reviewing?.type === 'quiz' && (
        <QuizReviewDrawer taskId={reviewing.taskId} onClose={() => setReviewing(null)} onReviewed={done} />
      )}
      {reviewing && reviewing.type !== 'interview' && reviewing.type !== 'quiz' && (
        <ReviewDrawer item={reviewing} onClose={() => setReviewing(null)} onReviewed={done} />
      )}
    </>
  );
}
