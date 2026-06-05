'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { Permission } from '@/lib/config/permissions';

/**
 * Show children only if the user holds the permission (UX gating - the server
 * still enforces). Pass `anyOf` for "has at least one of these".
 */
export function PermissionGuard({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: Permission | string;
  anyOf?: (Permission | string)[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAny, loading } = usePermissions();
  if (loading) return null;
  const ok = anyOf ? canAny(anyOf) : permission ? can(permission) : true;
  return <>{ok ? children : fallback}</>;
}
