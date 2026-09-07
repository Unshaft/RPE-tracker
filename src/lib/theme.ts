import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'rpe.theme';

export function readThemePref(): ThemePref {
  const raw = localStorage.getItem(KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => readThemePref());

  useEffect(() => {
    applyTheme(pref);
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  }, [pref]);

  return { pref, setPref: useCallback((p: ThemePref) => setPref(p), []) };
}
