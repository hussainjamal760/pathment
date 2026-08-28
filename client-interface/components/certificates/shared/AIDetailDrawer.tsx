'use client';

import { Drawer } from '@/components/shared/Drawer';
import { CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { getTierBadgeColor } from '@/lib/utils/certificates';
import type { AIEvaluationResult } from '@/lib/services/certificates-api';

interface TierOption { id: string; name: string; }

interface AIDetailDrawerProps {
  /** The AI result to show; null/undefined = drawer closed */
  mentee: (AIEvaluationResult & { mentee_id: string }) | null;
  onClose: () => void;
  /** Tier options for the override dropdown */
  criteria: TierOption[];
  /** Currently selected tier for this mentee (may differ from AI recommendation) */
  selectedTier?: string;
  onTierChange: (menteeId: string, tier: string) => void;
  /** Label for the override section: "Override Tier" for admin, "Override Tier" for mentor */
  overrideLabel?: string;
}

/**
 * Shared AI Detail Drawer used by both Admin (CertificateEditor) and Mentor issuance page.
 * Shows AI score, hard constraint check, reasoning, keyword match, blockers, and tier override.
 */
export function AIDetailDrawer({
  mentee,
  onClose,
  criteria,
  selectedTier,
  onTierChange,
  overrideLabel = 'Override Tier',
}: AIDetailDrawerProps) {
  const effectiveTier = selectedTier ?? mentee?.certificate_tier ?? '';

  return (
    <Drawer
      open={!!mentee}
      onClose={onClose}
      title={mentee ? `${mentee.firstName} ${mentee.lastName}` : 'AI Analysis'}
      subtitle="AI Eligibility & Tech Stack Evaluation Analysis"
      width="md"
    >
      {mentee && (
        <div className="space-y-5 pt-1">
          {/* Header Banner */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-violet-500/10 via-brand-500/5 to-transparent border border-violet-500/20">
            <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-foreground">{mentee.firstName} {mentee.lastName}</h4>
              <p className="text-[10px] text-muted-foreground">{mentee.email}</p>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl border border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 text-center">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">AI Score</p>
              <p className="text-base font-black text-violet-600 dark:text-violet-400">{mentee.match_score}/100</p>
            </div>
            <div className="p-3.5 rounded-2xl border border-brand-500/20 bg-brand-500/5 dark:bg-brand-500/10 text-center">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Score %</p>
              <p className="text-base font-black text-brand-600 dark:text-brand-400">{mentee.overall_percentage}%</p>
            </div>
            <div className="p-3.5 rounded-2xl border border-border bg-card text-center flex flex-col justify-between">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">AI Tier</p>
              <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${getTierBadgeColor(effectiveTier)}`}>
                {criteria.find(c => c.id === effectiveTier)?.name ?? effectiveTier}
              </span>
            </div>
          </div>

          {/* Hard Constraints Check */}
          {mentee.hard_constraints_check && (
            <div className="p-4 rounded-2xl border border-border bg-card shadow-2xs space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hard Constraints Check</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'score_ok',           label: 'Min Score' },
                  { key: 'blockers_ok',        label: 'Open Blockers' },
                  { key: 'completion_rate_ok', label: 'Completion Rate' },
                  { key: 'on_time_rate_ok',    label: 'On-Time Rate' },
                  { key: 'rating_ok',          label: 'Avg Rating' },
                ] as const).map(({ key, label }) => {
                  const ok = mentee.hard_constraints_check?.[key] !== false;
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 p-2 rounded-xl text-[10px] font-bold ${
                        ok
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {ok
                        ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 shrink-0" />
                      }
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Reasoning */}
          <div className="p-4 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-brand-500/5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400 font-extrabold text-[10px] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> AI Reasoning & Summary
            </div>
            <p className="text-xs text-foreground leading-relaxed font-medium">
              {mentee.reasoning || 'No reasoning provided.'}
            </p>
          </div>

          {/* Matched Keywords */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Matched Keywords / Tech Stack</p>
            <div className="flex flex-wrap gap-1.5">
              {(mentee.matched_keywords || []).length === 0 ? (
                <span className="text-xs text-muted-foreground italic">None matched</span>
              ) : (
                mentee.matched_keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold border border-emerald-500/20"
                  >
                    <CheckCircle2 className="w-3 h-3" /> {kw}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Missing Keywords */}
          {(mentee.missing_keywords || []).length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Missing Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {mentee.missing_keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold border border-red-500/20"
                  >
                    <XCircle className="w-3 h-3" /> {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Blockers Analysis */}
          {mentee.blockers_analysis && (
            <div className="p-4 rounded-2xl border border-border bg-card space-y-2.5 shadow-3xs">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Blocker Resolution Activity</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-muted/40">
                  <p className="text-xs font-black text-foreground">{mentee.blockers_analysis.total}</p>
                  <p className="text-[9px] text-muted-foreground font-semibold">Total</p>
                </div>
                <div className="p-2 rounded-xl bg-emerald-500/10">
                  <p className="text-xs font-black text-emerald-600">{mentee.blockers_analysis.resolved}</p>
                  <p className="text-[9px] text-muted-foreground font-semibold">Resolved</p>
                </div>
                <div className="p-2 rounded-xl bg-muted/40">
                  <p className={`text-xs font-black ${
                    mentee.blockers_analysis.impact === 'High'   ? 'text-red-500'
                    : mentee.blockers_analysis.impact === 'Medium' ? 'text-amber-600'
                    : 'text-emerald-600'
                  }`}>
                    {mentee.blockers_analysis.impact}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-semibold">Impact</p>
                </div>
              </div>
              {mentee.blockers_analysis.summary && (
                <p className="text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/60 mt-2 font-medium">
                  {mentee.blockers_analysis.summary}
                </p>
              )}
            </div>
          )}

          {/* Override Tier */}
          <div className="p-4 rounded-2xl border border-border bg-muted/20 space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              {overrideLabel}
            </label>
            <select
              value={effectiveTier}
              onChange={(e) => onTierChange(mentee.mentee_id, e.target.value)}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground font-bold focus:outline-none cursor-pointer focus:border-brand-500"
            >
              {criteria.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Drawer>
  );
}
