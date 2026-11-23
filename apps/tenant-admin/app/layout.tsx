import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = { title: { default: 'WebApp Builder', template: '%s · WebApp Builder' }, robots: { index: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
