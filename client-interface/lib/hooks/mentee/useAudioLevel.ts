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
    analyser.smoothingTimeConstant = 0.6; // more responsive to speech
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
      // Perceptual (sqrt) curve so normal speech clearly moves the meter — a raw
      // RMS reading stays tiny (~0.03–0.1) and barely registers.
      setLevel(Math.min(1, Math.sqrt(rms) * 1.8));
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
