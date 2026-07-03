'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { interviewApi, type ProctorEvent } from '@/lib/services/interview-api';

/**
 * useProctor — the interview anti-cheat harness (all client-side, zero cost).
 * While `active`, it:
 *   - locks the page to fullscreen and flags any exit,
 *   - counts tab/window focus losses (visibility + blur),
 *   - blocks & logs copy / paste / right-click,
 *   - captures periodic webcam snapshots (when a camera stream is provided),
 * and buffers every event, flushing to the server on an interval and on demand.
 * The mentor sees the resulting proctor log in review (Phase 4).
 */
export interface ProctorState {
  focusLosses: number;
  isFullscreen: boolean;
  totalEvents: number;
  requestFullscreen: () => Promise<void>;
  log: (type: string, meta?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
}

interface Options {
  sessionId: string | null;
  active: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraRequired: boolean;
  snapshotIntervalMs?: number;
  flushIntervalMs?: number;
}

export function useProctor({
  sessionId,
  active,
  videoRef,
  cameraRequired,
  snapshotIntervalMs = 20000,
  flushIntervalMs = 10000,
}: Options): ProctorState {
  const [focusLosses, setFocusLosses] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [totalEvents, setTotalEvents] = useState(0);

  const buffer = useRef<ProctorEvent[]>([]);
  const sessionRef = useRef(sessionId);
  const activeRef = useRef(active);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);
  useEffect(() => { activeRef.current = active; }, [active]);

  // ── Event buffering + flush ──────────────────────────────────────────────
  const flush = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid || buffer.current.length === 0) return;
    const batch = buffer.current;
    buffer.current = [];
    try {
      await interviewApi.logProctor(sid, batch);
    } catch {
      // Re-queue on failure so nothing is lost.
      buffer.current = [...batch, ...buffer.current];
    }
  }, []);

  const log = useCallback((type: string, meta: Record<string, unknown> = {}) => {
    buffer.current.push({ type, at: new Date().toISOString(), meta });
    setTotalEvents((n) => n + 1);
  }, []);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const requestFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      /* user may deny; the exit banner handles it */
    }
  }, []);

  // ── DOM listeners while active ──────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    const onVisibility = () => {
      if (document.hidden) { setFocusLosses((n) => n + 1); log('focus_loss', { reason: 'tab_hidden' }); }
    };
    const onBlur = () => {
      // Ignore blur that coincides with going fullscreen; only count real leaves.
      if (!document.hidden) log('window_blur');
    };
    const onFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) log('fullscreen_exit');
    };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); log('copy_blocked'); };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); log('context_menu_blocked'); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [active, log]);

  // ── Periodic flush ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { flush(); }, flushIntervalMs);
    return () => { clearInterval(id); flush(); };
  }, [active, flushIntervalMs, flush]);

  // ── Periodic webcam snapshots ────────────────────────────────────────────
  useEffect(() => {
    if (!active || !cameraRequired) return;
    const capture = async () => {
      const video = videoRef.current;
      const sid = sessionRef.current;
      if (!video || !sid || video.readyState < 2 || !video.videoWidth) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) interviewApi.uploadSnapshot(sid, blob).catch(() => { /* best-effort */ });
      }, 'image/jpeg', 0.6);
    };
    // One shortly after start, then on the interval.
    const first = setTimeout(capture, 3000);
    const id = setInterval(capture, snapshotIntervalMs);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active, cameraRequired, snapshotIntervalMs, videoRef]);

  return { focusLosses, isFullscreen, totalEvents, requestFullscreen, log, flush };
}
