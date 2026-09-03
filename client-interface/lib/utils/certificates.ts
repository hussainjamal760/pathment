/**
 * Shared utilities for the certificates feature.
 * Single source of truth for tier color mappings — eliminates 5 identical
 * ternary blocks duplicated across CertificateEditor.tsx and mentor/certificates/page.tsx.
 */

// ─── Badge / pill color classes ───────────────────────────────────────────────

/**
 * Returns Tailwind classes for an issued-tier badge pill (border variant).
 * Falls back to blue for any custom / unknown tier ID.
 */
export function getTierBadgeColor(tierId: string): string {
  switch (tierId) {
    case 'gold':   return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20 dark:border-amber-500/30';
    case 'silver': return 'text-slate-600 dark:text-slate-300 bg-slate-500/10 dark:bg-slate-500/20 border-slate-500/20 dark:border-slate-500/30';
    case 'bronze': return 'text-amber-800 dark:text-amber-300 bg-amber-700/10 dark:bg-amber-700/20 border-amber-700/20 dark:border-amber-700/30';
    default:       return 'text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/20 dark:border-blue-500/30';
  }
}

/**
 * Returns Tailwind classes for a bulk-action button (filled + hover variant).
 */
export function getTierButtonColor(tierId: string): string {
  switch (tierId) {
    case 'gold':   return 'bg-amber-500/10 hover:bg-amber-500/20 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30';
    case 'silver': return 'bg-slate-500/10 hover:bg-slate-500/20 dark:bg-slate-500/20 dark:hover:bg-slate-500/30 text-slate-600 dark:text-slate-300 border-slate-500/20 dark:border-slate-500/30';
    case 'bronze': return 'bg-amber-700/10 hover:bg-amber-700/20 dark:bg-amber-700/20 dark:hover:bg-amber-700/30 text-amber-800 dark:text-amber-300 border-amber-700/20 dark:border-amber-700/30';
    default:       return 'bg-blue-500/10 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:hover:bg-blue-500/30 text-blue-600 dark:text-blue-400 border-blue-500/20 dark:border-blue-500/30';
  }
}

/**
 * Returns a Tailwind text-color class for tier icons in summary rollups.
 */
export function getTierIconColor(tierId: string): string {
  switch (tierId) {
    case 'gold':   return 'text-amber-500 dark:text-amber-400';
    case 'silver': return 'text-slate-400 dark:text-slate-300';
    case 'bronze': return 'text-amber-700 dark:text-amber-400';
    default:       return 'text-blue-500 dark:text-blue-400';
  }
}
