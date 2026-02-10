'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      // Check if user needs to complete onboarding
      if (!user.profileCompleted) {
        const step = user.onboardingStep || 0;

        // Step 0: Need to complete role-specific profile
        if (step === 0) {
          if (user.role === 'mentee') {
            router.push('/onboarding/mentee');
          } else if (user.role === 'mentor') {
            router.push('/onboarding/mentor');
          }
        }
        // Step 1: Profile completed, need to add skills
        else if (step === 1) {
          router.push('/onboarding/skills');
        }
        // Step 2: Everything complete
        // Allow access to dashboard
      }
    }
  }, [user, isLoading, router]);

  // Show loading while checking onboarding status
  if (isLoading || (user && !user.profileCompleted && user.onboardingStep !== 2)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
