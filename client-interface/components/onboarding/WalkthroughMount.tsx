'use client';

import { useEffect, useState } from 'react';
import type { UserRole } from '@/lib/types';
import { WALKTHROUGHS, TOUR_STORAGE_PREFIX, TOUR_EVENT } from '@/lib/config/walkthroughs';
import { Walkthrough } from './Walkthrough';

const seenKey = (role: UserRole) => `${TOUR_STORAGE_PREFIX}-${role}`;

/**
 * Mounts the role-aware walkthrough. Auto-starts ONCE per role for first-time
 * users (desktop only, where the sidebar targets exist), and re-runs whenever a
 * "?" help button dispatches the TOUR_EVENT. Marks it seen on close.
 */
export function WalkthroughMount({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Replay trigger (the help button), available on any device.
    const onStart = () => setOpen(true);
    window.addEventListener(TOUR_EVENT, onStart);

    // First-time auto-start (desktop only — the tour points at the sidebar).
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const seen = localStorage.getItem(seenKey(role));
      if (!seen && window.innerWidth >= 1024) {
        timer = setTimeout(() => setOpen(true), 900); // let the layout/nav paint
      }
    } catch { /* ignore */ }

    return () => { window.removeEventListener(TOUR_EVENT, onStart); if (timer) clearTimeout(timer); };
  }, [role]);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(seenKey(role), '1'); } catch { /* ignore */ }
  };

  if (!open) return null;
  return <Walkthrough steps={WALKTHROUGHS[role]} onClose={close} />;
}

export default WalkthroughMount;
