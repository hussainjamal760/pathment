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
    case 'gold':   return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
    case 'silver': return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
    case 'bronze': return 'text-amber-800 bg-amber-700/10 border-amber-700/20';
    default:       return 'text-blue-600 bg-blue-500/10 border-blue-500/20';
  }
}

/**
 * Returns Tailwind classes for a bulk-action button (filled + hover variant).
 */
export function getTierButtonColor(tierId: string): string {
  switch (tierId) {
    case 'gold':   return 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border-amber-500/20';
    case 'silver': return 'bg-slate-500/10 hover:bg-slate-500/20 text-slate-600 border-slate-500/20';
    case 'bronze': return 'bg-amber-700/10 hover:bg-amber-700/20 text-amber-800 border-amber-700/20';
    default:       return 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 border-blue-500/20';
  }
}

/**
 * Returns a Tailwind text-color class for tier icons in summary rollups.
 */
export function getTierIconColor(tierId: string): string {
  switch (tierId) {
    case 'gold':   return 'text-amber-500';
    case 'silver': return 'text-slate-400';
    case 'bronze': return 'text-amber-700';
    default:       return 'text-blue-500';
  }
}
