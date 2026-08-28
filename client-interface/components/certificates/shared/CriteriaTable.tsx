'use client';

import { Edit, Trash, Plus } from 'lucide-react';

interface TierCriteria {
  id: string;
  name: string;
  badgeUrl?: string;
  keywords?: string[];
  minScorePercent?: number;
  maxOpenBlockers?: number;
  minCompletionRate?: number;
  minOnTimeRate?: number;
  minAvgRating?: number;
  customRule?: string;
}

interface CriteriaTableProps {
  criteria: TierCriteria[];
  onAdd: () => void;
  onEdit: (tier: TierCriteria) => void;
  onDelete: (tierId: string) => void;
}

/**
 * Displays the list of certificate tiers with a brief criteria summary,
 * edit/delete actions, and an "Add Certificate Type" button.
 *
 * Shared by Admin CertificateEditor (Section 2) — and potentially
 * a future mentor criteria-preview panel.
 */
export function CriteriaTable({ criteria, onAdd, onEdit, onDelete }: CriteriaTableProps) {
  return (
    <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-start gap-3.5">
          <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-sm">
            2
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Certificate Criteria</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define hard-constraint rules and AI evaluation keywords for each certificate tier.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline bg-brand-500/5 hover:bg-brand-500/10 px-3.5 py-2 rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" /> Add Certificate Type
        </button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-2xl overflow-hidden bg-muted/10 divide-y divide-border">
        {/* Header row */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-4">Certificate Type</div>
          <div className="col-span-6">Criteria Summary</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Body */}
        {criteria.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground font-semibold">
            No certificate types configured. Click &quot;+ Add Certificate Type&quot; to begin.
          </div>
        ) : (
          criteria.map((tier) => {
            const kws           = tier.keywords || [];
            const minScore      = tier.minScorePercent    ?? 0;
            const maxB          = tier.maxOpenBlockers    ?? -1;
            const minCompletion = tier.minCompletionRate  ?? 0;
            const minOnTime     = tier.minOnTimeRate      ?? 0;
            const minRating     = tier.minAvgRating       ?? 0;

            const parts: string[] = [];
            if (kws.length > 0)      parts.push(`Keywords: ${kws.slice(0, 3).join(', ')}${kws.length > 3 ? ` +${kws.length - 3}` : ''}`);
            if (minScore > 0)        parts.push(`Score ≥${minScore}%`);
            if (maxB >= 0)           parts.push(`Blockers ≤${maxB}`);
            if (minCompletion > 0)   parts.push(`Completion ≥${minCompletion}%`);
            if (minOnTime > 0)       parts.push(`On-Time ≥${minOnTime}%`);
            if (minRating > 0)       parts.push(`Rating ≥${minRating}`);

            const summaryText = parts.length > 0
              ? parts.join(' · ')
              : 'Awarded to all active participants (no minimum requirements)';

            return (
              <div
                key={tier.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center text-xs font-semibold text-foreground bg-card hover:bg-muted/10 transition-colors"
              >
                {/* Name + Badge */}
                <div className="col-span-4 flex items-center gap-2">
                  {tier.badgeUrl ? (
                    <img src={tier.badgeUrl} className="w-7 h-7 object-contain rounded-md" alt={tier.name} />
                  ) : (
                    <div className="w-7 h-7 rounded-md bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-[10px]">
                      {tier.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="font-bold text-foreground">{tier.name}</span>
                </div>

                {/* Summary */}
                <div className="col-span-6 text-muted-foreground text-[11px] font-medium leading-relaxed">
                  {summaryText}
                </div>

                {/* Actions */}
                <div className="col-span-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(tier)}
                    className="p-1 text-muted-foreground hover:text-brand-500 hover:bg-muted rounded transition-colors"
                    title="Edit Criteria"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(tier.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                    title="Delete Tier"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
