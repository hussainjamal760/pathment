'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/components/ui/utils';

interface LoadingSpinnerProps {
  /** Custom message to display below the spinner */
  message?: string;
  /** Variant - 'page' for full-page centered, 'inline' for smaller contexts */
  variant?: 'page' | 'inline';
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export function LoadingSpinner({ 
  message = 'Loading...', 
  variant = 'inline',
  size = 'md',
  className 
}: LoadingSpinnerProps) {
  if (variant === 'page') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-4 py-20',
          className
        )}
      >
        <Loader2 className={cn('animate-spin text-indigo-600', sizeClasses[size])} />
        {message && (
          <p className="text-sm text-slate-600">{message}</p>
        )}
      </div>
    );
  }

  // inline variant
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 p-8',
        className
      )}
    >
      <Loader2 className={cn('animate-spin text-indigo-600', sizeClasses[size])} />
      {message && (
        <span className="text-sm text-slate-600">{message}</span>
      )}
    </div>
  );
}

/** Minimal inline loading indicator for buttons, rows, etc. */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current animation-delay-200" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current animation-delay-400" />
    </span>
  );
}
