'use client';

/**
 * DualProgress — shows absolute progress (raw output vs plan) alongside the
 * fairness-adjusted "relative" progress side by side. When the relative reads
 * meaningfully higher, the mentee is doing well given logged real constraints;
 * when they're about equal, output speaks for itself.
 *
 * Styled in the existing dashboard design system (indigo/slate), not the
 * prototype's look.
 */

interface DualProgressProps {
  absolute: number;
  relative: number;
  compact?: boolean;
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-700 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DualProgress({ absolute, relative, compact = false }: DualProgressProps) {
  const gap = Math.round(relative - absolute);
  return (
    <div className="space-y-2.5">
      <Bar label="Progress" value={absolute} color="bg-brand-500" />
      <Bar label="Adjusted for constraints" value={relative} color="bg-emerald-500" />
      {!compact && gap >= 8 && (
        <p className="text-xs text-emerald-600">
          +{gap} pts once logged constraints are counted — fighting to keep up.
        </p>
      )}
    </div>
  );
}
