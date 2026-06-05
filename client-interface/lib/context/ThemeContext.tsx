'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { themeConfig } from '../config/theme';
import {
  ACCENT_STORAGE_KEY, DEFAULT_ACCENT, THEME_PRESETS, isAccentKey, type AccentKey, type ThemePreset,
} from '../config/themes';
import { appearanceApi } from '../services/appearance-api';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Brand accent ("vibe") preset key. */
  accent: AccentKey;
  setAccent: (accent: AccentKey) => void;
  presets: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Apply theme + accent to <html> immediately (used before first paint). */
function applyToRoot(theme: Theme, accent: AccentKey) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
  if (accent === DEFAULT_ACCENT) root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(themeConfig.defaultTheme);
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);
  const [mounted, setMounted] = useState(false);

  // Mount: read cached prefs and apply synchronously (no flash, since the
  // provider gates children on `mounted`). Then reconcile with the server.
  useEffect(() => {
    let initialTheme: Theme = themeConfig.defaultTheme;
    let initialAccent: AccentKey = DEFAULT_ACCENT;
    try {
      const savedTheme = localStorage.getItem(themeConfig.storageKey) as Theme | null;
      if (savedTheme === 'light' || savedTheme === 'dark') initialTheme = savedTheme;
      const savedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (isAccentKey(savedAccent)) initialAccent = savedAccent;
    } catch { /* ignore */ }

    applyToRoot(initialTheme, initialAccent);
    setThemeState(initialTheme);
    setAccentState(initialAccent);
    setMounted(true);

    // Cross-device sync: pull the user's saved appearance (best-effort).
    try {
      const hasToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('token');
      if (hasToken) {
        appearanceApi.get()
          .then((res: any) => {
            const data = res?.data ?? res ?? {};
            const serverAccent = data.colorTheme;
            const serverTheme = data.theme;
            if (isAccentKey(serverAccent) && serverAccent !== initialAccent) {
              setAccentState(serverAccent);
              applyToRoot(serverTheme === 'dark' || serverTheme === 'light' ? serverTheme : initialTheme, serverAccent);
              localStorage.setItem(ACCENT_STORAGE_KEY, serverAccent);
            }
            if ((serverTheme === 'light' || serverTheme === 'dark') && serverTheme !== initialTheme) {
              setThemeState(serverTheme);
              localStorage.setItem(themeConfig.storageKey, serverTheme);
              document.documentElement.classList.toggle('dark', serverTheme === 'dark');
              document.documentElement.setAttribute('data-theme', serverTheme);
            }
          })
          .catch(() => { /* not logged in / offline — cache wins */ });
      }
    } catch { /* ignore */ }
  }, []);

  const persist = (next: { theme?: Theme; accent?: AccentKey }) => {
    try {
      if (next.theme) localStorage.setItem(themeConfig.storageKey, next.theme);
      if (next.accent) localStorage.setItem(ACCENT_STORAGE_KEY, next.accent);
      if (localStorage.getItem('token')) {
        appearanceApi.update({
          ...(next.accent ? { colorTheme: next.accent } : {}),
          ...(next.theme ? { theme: next.theme } : {}),
        }).catch(() => { /* offline — cache still holds it */ });
      }
    } catch { /* ignore */ }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyToRoot(newTheme, accent);
    persist({ theme: newTheme });
  };
  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  const setAccent = (key: AccentKey) => {
    if (!isAccentKey(key)) return;
    setAccentState(key);
    applyToRoot(theme, key);
    persist({ accent: key });
  };

  const value: ThemeContextType = { theme, setTheme, toggleTheme, accent, setAccent, presets: THEME_PRESETS };

  // Prevent flash of unstyled / wrong-accent content.
  if (!mounted) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
