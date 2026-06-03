'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * The standalone mentees list was replaced by the Cockpit (one card per mentee).
 * Redirect to keep any old links working.
 */
export default function MenteesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/mentor/dashboard'); }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );
}
