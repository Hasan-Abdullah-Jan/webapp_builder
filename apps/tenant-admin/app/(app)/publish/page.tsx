'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { PublishPanel } from '@/components/PublishPanel';
import { ErrorBox, confirmAction, useLoad, useToast } from '@/components/ui';

export default function PublishPage() {
  const { can } = useMe();
  const toast = useToast();
  const versions = useLoad(() => api<{ _id: string; version: number; publishedAt: string }[]>('site-config/versions'));
  const [busy, setBusy] = useState(false);

  async function rollback(v: number) {
    if (!confirmAction(`Make version ${v} live again? Your draft will be replaced with it.`)) return;
    setBusy(true);
    try {
      const r = await api<{ version: number }>('site-config/publish', { method: 'POST', body: { fromVersion: v } });
      toast(`Version ${v} is live again (as v${r.version})`);
      versions.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <div className="page-head"><h1>Publish</h1></div>
      <PublishPanel onPublished={versions.reload} />
      <div className="card">
        <h2>Version history</h2>
        <ErrorBox error={versions.error} />
        {versions.data?.length === 0 && <p className="muted">Nothing published yet.</p>}
        <table className="table">
          <tbody>
            {versions.data?.map((v, i) => (
              <tr key={v._id}>
                <td><strong>v{v.version}</strong> {i === 0 && <span className="pill ok">Live</span>}</td>
                <td className="muted">{new Date(v.publishedAt).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>
                  {i > 0 && can('site.publish') && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => rollback(v.version)}>Restore</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
