'use client';

import { Sparkles } from 'lucide-react';

interface AIEvaluationBannerProps {
  count: number;
  ranAt: string | null;
  runningAI?: boolean;
  progressCount?: number;
  totalCount?: number;
}

/**
 * Compact banner shown after or during an AI evaluation run.
 * Displays evaluated mentee count, timestamp, or real-time progress.
 */
export function AIEvaluationBanner({ count, ranAt, runningAI, progressCount = 0, totalCount = 0 }: AIEvaluationBannerProps) {
  if (runningAI && totalCount > 0) {
    const percent = Math.round((progressCount / totalCount) * 100);
    return (
      <div className="bg-violet-500/5 dark:bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3 text-xs font-semibold space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-violet-700 dark:text-violet-300 font-bold">
            <Sparkles className="w-3.5 h-3.5 animate-spin text-violet-600" style={{ animationDuration: '3s' }} /> Evaluating mentees with AI...
          </span>
          <span className="text-muted-foreground font-mono text-[10px] bg-violet-500/10 px-2 py-0.5 rounded-full">
            {progressCount} / {totalCount} ({percent}%)
          </span>
        </div>
        <div className="w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
          <div 
            className="bg-violet-600 h-1.5 rounded-full transition-all duration-300 ease-out" 
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  if (!ranAt) return null;
  return (
    <div className="flex items-center justify-between bg-violet-500/5 dark:bg-violet-500/10 border border-violet-500/20 rounded-xl px-3.5 py-2 text-[10px] text-muted-foreground font-semibold">
      <span className="flex items-center gap-1.5 text-violet-700 dark:text-violet-300 font-bold">
        <Sparkles className="w-3.5 h-3.5" /> AI Evaluated {count} mentee{count !== 1 ? 's' : ''}
      </span>
      <span>Last run: {new Date(ranAt).toLocaleString()}</span>
    </div>
  );
}
