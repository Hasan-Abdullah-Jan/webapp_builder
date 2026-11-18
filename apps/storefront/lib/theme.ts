import type { Theme } from './types';

const RADIUS: Record<string, string> = { none: '0px', sm: '4px', md: '8px', lg: '14px', full: '22px' };

const DEFAULTS = { primary: '#E31837', secondary: '#FFC72C', background: '#FFFFFF', surface: '#F7F7F8', text: '#1A1A1A' };

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text colour on top of a brand colour (WCAG contrast). */
export function onColor(hex: string) {
  return luminance(hex) > 0.4 ? '#111111' : '#FFFFFF';
}

function mix(hex: string, withHex: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  return '#' + a.map((c, i) => Math.round(c + (b[i] - c) * amount).toString(16).padStart(2, '0')).join('');
}

/** Theme tokens → CSS custom properties (plan §6). Components never hard-code colours. */
export function themeVars(theme: Theme = {}): Record<string, string> {
  const c = { ...DEFAULTS, ...Object.fromEntries(Object.entries(theme.colors ?? {}).filter(([, v]) => isHex(v))) };
  const dark = luminance(c.background) < 0.2;
  return {
    '--c-primary': c.primary,
    '--c-primary-hover': mix(c.primary, dark ? '#ffffff' : '#000000', 0.12),
    '--c-on-primary': onColor(c.primary),
    '--c-secondary': c.secondary,
    '--c-on-secondary': onColor(c.secondary),
    '--c-bg': c.background,
    '--c-surface': c.surface,
    '--c-text': c.text,
    '--c-muted': mix(c.text, c.background, 0.42),
    '--c-border': mix(c.text, c.background, 0.86),
    '--radius': RADIUS[theme.radius ?? 'md'] ?? RADIUS.md,
    '--btn-radius': theme.buttonStyle === 'pill' ? '999px' : RADIUS[theme.radius ?? 'md'] ?? RADIUS.md,
    '--font-heading': `'${theme.fonts?.heading ?? 'Poppins'}', system-ui, sans-serif`,
    '--font-body': `'${theme.fonts?.body ?? 'Inter'}', system-ui, sans-serif`,
  };
}

export function fontsHref(theme: Theme = {}) {
  const fams = [...new Set([theme.fonts?.heading ?? 'Poppins', theme.fonts?.body ?? 'Inter'])];
  const q = fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700`).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

export function cssVarsString(theme: Theme = {}) {
  return Object.entries(themeVars(theme)).map(([k, v]) => `${k}:${v}`).join(';');
}
