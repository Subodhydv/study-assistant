import { useCallback, useEffect, useState } from 'react';
import { loadTheme, saveTheme } from '../lib/storage.js';

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = loadTheme();
    return saved === 'dark' || saved === 'light' ? saved : systemTheme();
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
