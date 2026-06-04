'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getNavigationLinks, type NavLink } from '@/lib/config/navigation';
import { loadNavPrefs, saveNavPrefs, applyNavPrefs, type RolePrefs } from '@/lib/config/navPreferences';
import type { UserRole } from '@/lib/types';

/**
 * Sidebar pin/reorder for the current user+role. Reads the static nav config,
 * overlays the saved order + pinned set, and exposes mutators that persist to
 * localStorage. Guards against SSR hydration mismatch with a `mounted` flag.
 */
export function useNavPreferences(role: UserRole) {
  const base = useMemo(() => getNavigationLinks(role), [role]);
  const [prefs, setPrefs] = useState<RolePrefs | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPrefs(loadNavPrefs()[role]);
  }, [role]);

  const links = useMemo(() => (mounted ? applyNavPrefs(base, prefs) : base), [mounted, base, prefs]);
  const pinned = useMemo(() => new Set(prefs?.pinned ?? []), [prefs]);

  const persist = useCallback((next: RolePrefs) => {
    setPrefs(next);
    const all = loadNavPrefs();
    all[role] = next;
    saveNavPrefs(all);
  }, [role]);

  const displayedOrder = useCallback((): string[] => links.map((l: NavLink) => l.path), [links]);

  const togglePin = useCallback((path: string) => {
    const current = prefs?.pinned ?? [];
    const nextPinned = current.includes(path) ? current.filter((p) => p !== path) : [...current, path];
    persist({ order: displayedOrder(), pinned: nextPinned });
  }, [prefs, persist, displayedOrder]);

  const move = useCallback((path: string, dir: -1 | 1) => {
    const order = displayedOrder();
    const i = order.indexOf(path);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    persist({ order, pinned: prefs?.pinned ?? [] });
  }, [displayedOrder, persist, prefs]);

  const reset = useCallback(() => persist({ order: [], pinned: [] }), [persist]);

  return {
    links,
    pinned,
    isEditing,
    toggleEdit: () => setIsEditing((e) => !e),
    togglePin,
    moveUp: (p: string) => move(p, -1),
    moveDown: (p: string) => move(p, 1),
    reset,
  };
}
