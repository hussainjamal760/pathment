'use client';

import { Mic } from 'lucide-react';
import { fmtClock } from '@/lib/utils/interviewMedia';

/**
 * Presentation pieces for the interview "studio": an animated interviewer avatar
 * (pulses while speaking, breathes with the mic when listening), a live mic
 * waveform, and a circular countdown ring. All purely visual / zero-cost.
 */

export function InterviewerOrb({
  speaking,
  level = 0,
  name = 'Aria',
  size = 72,
}: {
  speaking: boolean;
  level?: number;
  name?: string;
  size?: number;
}) {
  // A gentle scale that reacts to the interviewer's speech (or the candidate's
  // voice level when passed in) so the orb feels alive.
  const scale = 1 + (speaking ? 0.06 + level * 0.12 : level * 0.06);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Expanding rings while speaking */}
      {speaking && (
        <>
          <span className="absolute inset-0 rounded-full bg-brand-400/30 animate-ping" />
          <span className="absolute inset-0 rounded-full bg-brand-400/20 animate-ping" style={{ animationDelay: '0.4s' }} />
        </>
      )}
      <div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-lg transition-transform duration-150"
        style={{ transform: `scale(${scale})` }}
      >
        <span className="text-xl font-semibold tracking-tight">{name.slice(0, 1).toUpperCase()}</span>
      </div>
    </div>
  );
}

export function Waveform({ level, active, bars = 28 }: { level: number; active: boolean; bars?: number }) {
  // Static per-bar weighting (taller in the middle) modulated by the live level,
  // so the bars ripple with the voice without needing per-frequency data.
  return (
    <div className="flex items-end justify-center gap-[3px] h-12">
      {Array.from({ length: bars }).map((_, i) => {
        const mid = 1 - Math.abs(i - bars / 2) / (bars / 2); // 0 at edges, 1 center
        const weight = 0.35 + mid * 0.65;
        const h = active ? Math.max(6, Math.min(100, (8 + level * 92 * weight) * (0.7 + ((i * 37) % 10) / 14))) : 6;
        return (
          <span
            key={i}
            className={`w-[3px] rounded-full transition-[height] duration-100 ${active ? 'bg-brand-400' : 'bg-slate-600'}`}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

export function RingTimer({ remaining, total, size = 56 }: { remaining: number; total: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const danger = remaining <= 10;
  const warn = remaining <= 30;
  const stroke = danger ? '#f87171' : warn ? '#fbbf24' : '#5a8bff';
  return (
    <div className="relative" style={{ width: size, height: size }} title="Time left">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-slate-700" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums ${danger ? 'text-red-300' : 'text-slate-100'}`}>
        {fmtClock(Math.max(0, remaining))}
      </span>
    </div>
  );
}

/** Small mic-check pill used in the green room. */
export function MicCheck({ level, heard }: { level: number; heard: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Mic className={`w-4 h-4 ${heard ? 'text-emerald-400' : 'text-slate-400'}`} />
      <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-brand-400 to-emerald-400 transition-[width] duration-100" style={{ width: `${Math.min(100, level * 140)}%` }} />
      </div>
      <span className={`text-xs ${heard ? 'text-emerald-400' : 'text-slate-400'}`}>{heard ? 'We can hear you ✓' : 'Say hello…'}</span>
    </div>
  );
}
