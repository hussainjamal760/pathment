'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * useAudioLevel — a live 0..1 loudness reading for a mic MediaStream, via the Web
 * Audio API (AnalyserNode RMS). Used for the green-room mic check and the "listening"
 * waveform while recording a voice answer. Returns 0 when there's no stream.
 */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) { setLevel(0); return; }

    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      analyser.getByteTimeDomainData(data);
      // RMS around the 128 midpoint → 0..1.
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      // Gentle boost + clamp so quiet speech still registers visibly.
      setLevel(Math.min(1, rms * 2.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { source.disconnect(); } catch { /* noop */ }
      try { ctx.close(); } catch { /* noop */ }
    };
  }, [stream]);

  return level;
}

export default useAudioLevel;
