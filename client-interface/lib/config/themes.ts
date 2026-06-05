/**
 * Per-user accent "vibes". Each key maps to an `html[data-accent="<key>"]` block
 * in styles/globals.css that overrides ONLY the brand scale — so a preset can
 * never break neutrals, status colors, or contrast. Ocean is the default and
 * lives on :root (no attribute needed).
 */
export type AccentKey =
  | 'ocean' | 'emerald' | 'violet' | 'sunset' | 'rose' | 'sky' | 'amber' | 'graphite';

export interface ThemePreset {
  key: AccentKey;
  name: string;
  /** The personality/feeling shown under the swatch in the picker. */
  vibe: string;
  /** Representative swatch color (the preset's brand-600). */
  swatch: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'ocean',    name: 'Ocean',    vibe: 'Calm & focused',      swatch: '#0066FF' },
  { key: 'emerald',  name: 'Emerald',  vibe: 'Fresh & growing',     swatch: '#059669' },
  { key: 'violet',   name: 'Violet',   vibe: 'Creative & premium',  swatch: '#7C3AED' },
  { key: 'sunset',   name: 'Sunset',   vibe: 'Warm & energetic',    swatch: '#EA580C' },
  { key: 'rose',     name: 'Rose',     vibe: 'Bold & expressive',   swatch: '#E11D48' },
  { key: 'sky',      name: 'Sky',      vibe: 'Bright & open',       swatch: '#0891B2' },
  { key: 'amber',    name: 'Amber',    vibe: 'Optimistic & warm',   swatch: '#D97706' },
  { key: 'graphite', name: 'Graphite', vibe: 'Minimal & serious',   swatch: '#475569' },
];

export const DEFAULT_ACCENT: AccentKey = 'ocean';
export const ACCENT_KEYS = THEME_PRESETS.map((p) => p.key) as AccentKey[];
export const ACCENT_STORAGE_KEY = 'pathment-accent';

export function isAccentKey(v: unknown): v is AccentKey {
  return typeof v === 'string' && (ACCENT_KEYS as string[]).includes(v);
}
