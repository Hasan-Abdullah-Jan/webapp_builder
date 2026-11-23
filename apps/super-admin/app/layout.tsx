import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = { title: { default: 'WebApp Builder Ops', template: '%s · WebApp Builder Ops' }, robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
