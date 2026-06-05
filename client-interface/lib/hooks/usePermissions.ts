'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { accessApi } from '@/lib/services/access-api';
import type { Permission } from '@/lib/config/permissions';

interface PermState { permissions: string[]; canAccessAdmin: boolean }

// Module-level cache so every component shares one fetch per signed-in user.
let cache: { userId: string; data: PermState } | null = null;
let inflight: Promise<PermState> | null = null;

/**
 * The current user's permission UNION (across all scopes) + an `canAccessAdmin`
 * flag, for showing/hiding UI. Server still enforces per-request - this is UX
 * only; fine-grained per-resource checks remain server-side.
 */
export function usePermissions() {
  const { user } = useAuth();
  const cached = cache && user && cache.userId === user.id ? cache.data : null;
  const [state, setState] = useState<PermState>(cached || { permissions: [], canAccessAdmin: false });
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!user) { setState({ permissions: [], canAccessAdmin: false }); setLoading(false); return; }
    if (cache && cache.userId === user.id) { setState(cache.data); setLoading(false); return; }

    let active = true;
    setLoading(true);
    inflight = inflight || accessApi.myPermissions();
    inflight
      .then((data) => { cache = { userId: user.id, data }; if (active) setState(data); })
      .catch(() => { if (active) setState({ permissions: [], canAccessAdmin: false }); })
      .finally(() => { inflight = null; if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id]);

  const can = useCallback((perm: Permission | string) => state.permissions.includes(perm), [state.permissions]);
  const canAny = useCallback((perms: (Permission | string)[]) => perms.some((p) => state.permissions.includes(p)), [state.permissions]);

  return { permissions: state.permissions, canAccessAdmin: state.canAccessAdmin, can, canAny, loading };
}

/** Convenience: just the `can` predicate. */
export function useCan() {
  return usePermissions().can;
}
