'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, storeUrl } from '@/lib/client';
import { useMe } from './Shell';
import { useLoad, useToast } from './ui';

const LINKS: Record<string, string> = {
  logo: '/design', category: '/menu', product: '/menu', branch: '/branches', fulfilment: '/features', payment: '/features',
};

/** Plan §11.2: readiness checklist → publish → live URL with share links. */
export function PublishPanel({ onPublished }: { onPublished?: () => void }) {
  const { me, reload, can } = useMe();
  const toast = useToast();
  const ready = useLoad(() => api<{ ready: boolean; checks: { key: string; label: string; ok: boolean; required: boolean }[] }>('site-config/readiness'));
  const [busy, setBusy] = useState(false);
  const [publishedAt, setPublishedAt] = useState<number | null>(null);
  const url = storeUrl(me.tenant.slug);

  async function publish() {
    setBusy(true);
    try {
      const r = await api<{ version: number }>('site-config/publish', { method: 'POST', body: {} });
      setPublishedAt(r.version);
      toast(`Published v${r.version}. Your site is live!`);
      await reload();
      onPublished?.();
    } catch (e) {
      toast((e as Error).message, 'error');
      ready.reload();
    } finally {
      setBusy(false);
    }
  }

  const share = `Order online from ${me.tenant.name}: ${url}`;
  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>{me.tenant.status === 'active' ? 'Publish your latest changes' : 'Go live'}</h2>
        <span className="spacer" />
        {can('site.publish') && (
          <button className="btn btn-lg" disabled={busy || !ready.data?.ready} onClick={publish}>{busy ? 'Publishing…' : 'Publish'}</button>
        )}
      </div>
      <ul className="check-list">
        {ready.data?.checks.map((c) => (
          <li key={c.key}>
            <span className={`check${c.ok ? ' done' : ''}`} aria-hidden>{c.ok ? '✓' : ''}</span>
            <span style={{ flex: 1 }}>{c.label}{!c.required && <span className="muted small"> (recommended)</span>}</span>
            {!c.ok && <Link className="btn btn-secondary btn-sm" href={LINKS[c.key] ?? '/'}>Fix</Link>}
          </li>
        ))}
      </ul>
      {(me.tenant.status === 'active' || publishedAt) && (
        <div className="alert ok">
          <div className="row">
            <span>Your site is live at <a href={url} target="_blank" rel="noreferrer"><strong>{url.replace(/^https?:\/\//, '')}</strong></a></span>
            <span className="spacer" />
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copied'))}>Copy link</button>
            <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
          </div>
        </div>
      )}
    </div>
  );
}
