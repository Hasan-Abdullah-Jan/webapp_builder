'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { THEME_KEY } from '@/lib/theme';

type Mode = 'light' | 'dark' | 'system';
const KEY = THEME_KEY;

export function applyTheme(mode: Mode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}


export function ThemeSwitch() {
  const [mode, setMode] = useState<Mode>('system');
  useEffect(() => {
    try {
      setMode((localStorage.getItem(KEY) as Mode) || 'system');
    } catch {
      /* storage blocked */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      let m: Mode = 'system';
      try { m = (localStorage.getItem(KEY) as Mode) || 'system'; } catch { /* ignore */ }
      if (m === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  function choose(m: Mode) {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
    applyTheme(m);
  }
  const opts: { m: Mode; icon: typeof Sun; label: string }[] = [
    { m: 'light', icon: Sun, label: 'Light theme' },
    { m: 'dark', icon: Moon, label: 'Dark theme' },
    { m: 'system', icon: Monitor, label: 'Match system theme' },
  ];
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {opts.map((o) => (
        <button key={o.m} type="button" aria-pressed={mode === o.m} aria-label={o.label} data-tip={o.label} onClick={() => choose(o.m)}>
          <o.icon size={14} />
        </button>
      ))}
    </div>
  );
}
