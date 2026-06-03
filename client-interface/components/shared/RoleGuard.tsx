'use client';

import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import { UserRole } from '@/lib/types';
import { Loader2 } from 'lucide-react';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
}

export function RoleGuard({ children, allowedRoles, redirectTo = '/login' }: RoleGuardProps) {
  const { user, isLoading, availableRoles, activeRole, setActiveRole } = useAuth();
  const router = useRouter();

  // A user may enter a section if any of their capabilities matches it. This
  // is what lets an admin who is also a mentee open the mentee section, etc.
  const permitted = !!user && allowedRoles.some((r) => availableRoles.includes(r));
  const sectionRole = allowedRoles[0];

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push(redirectTo);
      return;
    }
    if (!permitted) {
      // Send them to a section they can actually access.
      const fallback = activeRole || user.role;
      router.push(`/${fallback}/dashboard`);
      return;
    }
    // Keep the active-role view in sync with the section being viewed, so the
    // sidebar switcher highlights correctly and role-scoped UI is consistent.
    if (sectionRole && activeRole !== sectionRole && availableRoles.includes(sectionRole)) {
      setActiveRole(sectionRole);
    }
  }, [user, isLoading, permitted, sectionRole, activeRole, availableRoles, redirectTo, router, setActiveRole]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!permitted) {
    return null;
  }

  return <>{children}</>;
}
