import type { NavLink } from './navigation';

/** Per-user sidebar customization (pin + reorder), persisted in localStorage. */
export const NAV_PREFS_KEY = 'pathment-nav-prefs';

export interface RolePrefs {
  /** Stable nav paths in the user's chosen order. */
  order: string[];
  /** Stable nav paths the user pinned to the top. */
  pinned: string[];
}
export type NavPrefs = Record<string, RolePrefs>;

export function loadNavPrefs(): NavPrefs {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(NAV_PREFS_KEY) || '{}') as NavPrefs; } catch { return {}; }
}

export function saveNavPrefs(prefs: NavPrefs): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore quota */ }
}

/**
 * Overlay a role's saved prefs on the static config. The static config stays
 * the source of truth for icons/labels/children — we only reorder + float
 * pinned items to the top. New config items the user has never seen are
 * appended automatically (so shipping a new nav item never hides it).
 */
export function applyNavPrefs(links: NavLink[], prefs?: RolePrefs): NavLink[] {
  const order = prefs?.order ?? [];
  const pinned = new Set(prefs?.pinned ?? []);
  const byPath = new Map(links.map((l) => [l.path, l]));

  const seen = new Set<string>();
  const ordered: NavLink[] = [];
  order.forEach((p) => { const l = byPath.get(p); if (l && !seen.has(p)) { ordered.push(l); seen.add(p); } });
  links.forEach((l) => { if (!seen.has(l.path)) { ordered.push(l); seen.add(l.path); } });

  // Pinned float to the top, preserving their relative order.
  const pinnedLinks = ordered.filter((l) => pinned.has(l.path));
  const rest = ordered.filter((l) => !pinned.has(l.path));
  return [...pinnedLinks, ...rest];
}
