'use client';

import { useEffect, useCallback } from 'react';
import { activityApi } from '@/lib/services/activity-api';
import type { ActivityEventType, ActivityEventCategory } from '@/lib/types/activity';
import { apiConfig } from '@/lib/config/api';

// How often to flush visible time to the server (1 minute = fast feedback)
const FLUSH_INTERVAL_MS = 60 * 1000;

export function useActivityTracker() {
  useEffect(() => {
    // isActive = tab is visible AND this browser window has OS focus
    // Both conditions must be true to count time.
    let tabFocusedAt: number | null =
      document.visibilityState === 'visible' ? Date.now() : null;

    console.log('[tracker] mounted, visible=%s hasFocus=%s', document.visibilityState === 'visible', document.hasFocus());

    // If the window doesn't have focus on mount (e.g. user opened in background), don't count
    if (!document.hasFocus()) {
      tabFocusedAt = null;
    }

    activityApi.startSession().catch((e) => {
      console.error('[tracker] startSession error', e);
    });

    /** Returns seconds of active visibility since last flush, resets the clock. */
    const flushSeconds = (): number => {
      if (tabFocusedAt === null) return 0;
      const elapsed = Math.floor((Date.now() - tabFocusedAt) / 1000);
      tabFocusedAt = Date.now();
      return elapsed;
    };

    /** Send seconds to server as rounded minutes (min 1 if >= 10s) */
    const sendHeartbeat = (seconds: number) => {
      if (seconds < 10) return;
      const minutes = Math.max(1, Math.round(seconds / 60));
      console.log('[tracker] heartbeat seconds=%d → minutes=%d', seconds, minutes);
      activityApi.heartbeat(minutes)
        .then((r) => console.log('[tracker] heartbeat ok', r))
        .catch((e) => console.error('[tracker] heartbeat FAILED', e));
    };

    const startClock = (reason: string) => {
      if (tabFocusedAt === null) {
        tabFocusedAt = Date.now();
        console.log('[tracker] clock started (%s)', reason);
      }
    };

    const pauseClock = (reason: string) => {
      const seconds = flushSeconds();
      tabFocusedAt = null;
      console.log('[tracker] clock paused (%s) flushed=%ds', reason, seconds);
      sendHeartbeat(seconds);
    };

    // Flush every minute while the tab is active
    const interval = setInterval(() => {
      if (tabFocusedAt === null) return;
      const seconds = flushSeconds();
      console.log('[tracker] tick - seconds=%d', seconds);
      sendHeartbeat(seconds);
    }, FLUSH_INTERVAL_MS);

    // ── Tab switch within the same browser ───────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pauseClock('tab hidden');
      } else if (document.hasFocus()) {
        // Only restart if the window actually has OS focus too
        startClock('tab visible');
      }
    };

    // ── App switch (Alt+Tab to VSCode, terminal, etc.) ───────────────────────
    const handleBlur = () => {
      pauseClock('window blur (switched to another app)');
    };

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        startClock('window focus (returned to browser)');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (tabFocusedAt !== null) {
        const seconds = flushSeconds();
        sendHeartbeat(seconds);
      }
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      console.log('[tracker] cleanup');
    };
  }, []); // runs once per mount - cleanup handles the StrictMode second run correctly

  const trackEvent = useCallback(
    (
      eventType: ActivityEventType,
      options?: {
        eventCategory?: ActivityEventCategory;
        entityType?: string;
        entityId?: string;
        metadata?: Record<string, unknown>;
      }
    ) => {
      activityApi.logEvent({ eventType, ...options }).catch(() => {});
    },
    []
  );

  const trackPageView = useCallback((page: string) => {
    activityApi.logPageView(page).catch(() => {});
  }, []);

  return { trackEvent, trackPageView };
}


