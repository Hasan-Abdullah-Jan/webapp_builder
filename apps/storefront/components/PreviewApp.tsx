'use client';

import { useEffect, useState } from 'react';
import type { Menu, SiteConfig, StoreData } from '@/lib/types';
import { StoreProvider } from './StoreProvider';
import { ThemeRoot } from './ThemeRoot';
import { Header } from './Header';
import { Footer } from './Footer';
import { Sections } from './Sections';

const ADMIN_ORIGIN = process.env.NEXT_PUBLIC_ADMIN_ORIGIN ?? 'http://localhost:3001';

/**
 * Builder live preview (plan §6.3). Loads the DRAFT config with a short-lived preview token,
 * then applies unsaved edits sent by the Tenant Admin via postMessage, so changes show
 * instantly. Clicking a section tells the builder to open that section's settings.
 */
export function PreviewApp({ token }: { token: string }) {
  const [data, setData] = useState<StoreData | null>(null);
  const [menu, setMenu] = useState<Menu>({ categories: [], items: [] });
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const h = { 'X-Preview-Token': token };
    Promise.all([
      fetch('/api/store/config', { headers: h, cache: 'no-store' }).then(async (r) => ({ ok: r.ok, body: await r.json() })),
      fetch('/api/store/menu', { headers: h, cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([cfg, m]) => {
        if (!cfg.ok) return setError(cfg.body.message ?? 'Preview unavailable');
        setData(cfg.body);
        if (m?.items) setMenu(m);
      })
      .catch(() => setError('Preview unavailable'));
  }, [token]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== ADMIN_ORIGIN) return; // only the admin app may drive the preview
      const msg = e.data as { type?: string; config?: Partial<SiteConfig>; index?: number | null; menu?: Menu };
      if (msg?.type === 'qs:config' && msg.config) {
        setData((d) => (d ? { ...d, config: { ...d.config, ...msg.config } as SiteConfig } : d));
      } else if (msg?.type === 'qs:select') {
        setSelected(msg.index ?? null);
        if (typeof msg.index === 'number') {
          document.querySelector(`[data-section="${msg.index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else if (msg?.type === 'qs:reload-menu') {
        fetch('/api/store/menu', { headers: { 'X-Preview-Token': token }, cache: 'no-store' })
          .then((r) => r.json())
          .then((m) => m?.items && setMenu(m));
      }
    }
    window.addEventListener('message', onMessage);
    window.parent?.postMessage({ type: 'qs:ready' }, ADMIN_ORIGIN);
    return () => window.removeEventListener('message', onMessage);
  }, [token]);

  if (error) {
    return (
      <main className="empty" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 22 }}>{error}</h1>
        <p style={{ color: '#666' }}>Preview links expire. Open a new one from your dashboard.</p>
      </main>
    );
  }
  if (!data) return <main className="empty" style={{ fontFamily: 'system-ui, sans-serif', color: '#666' }}>Loading preview…</main>;

  const select = (i: number) => {
    setSelected(i);
    window.parent?.postMessage({ type: 'qs:section-click', index: i }, ADMIN_ORIGIN);
  };

  return (
    <ThemeRoot theme={data.config.theme}>
      {selected !== null && (
        <style>{`[data-section="${selected}"]{outline:3px solid #2563EB;outline-offset:-3px}`}</style>
      )}
      <style>{`.preview-section:hover{outline:2px dashed #2563EB;outline-offset:-2px}`}</style>
      <StoreProvider data={data}>
        {/* Links are inert inside the builder so the preview never navigates away. */}
        <div
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('a')) e.preventDefault();
          }}
          style={{ display: 'contents' }}
        >
          <Header />
          <main style={{ flex: 1 }}>
            <Sections sections={data.config.layout.home ?? []} data={data} menu={menu} onSelect={select} />
          </main>
          <Footer data={data} />
        </div>
      </StoreProvider>
    </ThemeRoot>
  );
}
