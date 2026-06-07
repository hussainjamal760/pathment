'use client';

import { useEffect } from 'react';
import { ErrorView } from '@/components/shared/ErrorView';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[global error boundary]', error); }, [error]);
  return (
    <html lang="en">
      <body>
        <ErrorView error={error} reset={reset} home="/" title="The app hit a snag" />
      </body>
    </html>
  );
}
