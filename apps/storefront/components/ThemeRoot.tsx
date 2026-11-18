import type { CSSProperties, ReactNode } from 'react';
import type { Theme } from '@/lib/types';
import { fontsHref, themeVars } from '@/lib/theme';

/** Applies a tenant's design tokens as CSS variables and loads its curated font pair. */
export function ThemeRoot({ theme, children }: { theme: Theme; children: ReactNode }) {
  const vars = themeVars(theme) as CSSProperties;
  return (
    <div
      className={theme.buttonStyle === 'outline' ? 'theme-outline' : undefined}
      style={{ ...vars, background: 'var(--c-bg)', color: 'var(--c-text)', fontFamily: 'var(--font-body)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={fontsHref(theme)} precedence="default" />
      {/* Custom CSS is sanitised by the API (no <script>/<style> tags, javascript: urls, @import). */}
      {theme.customCss ? <style>{theme.customCss}</style> : null}
      {children}
    </div>
  );
}
