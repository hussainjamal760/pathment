'use client';

import { useEffect } from 'react';
import { ErrorView } from '@/components/shared/ErrorView';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[app error boundary]', error); }, [error]);
  return <ErrorView error={error} reset={reset} home="/" />;
}
