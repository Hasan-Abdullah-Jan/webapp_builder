'use client';

import { api } from '@/lib/client';
import { useLoad } from '@/components/OpsShell';

interface Entry { _id: string; tenantId?: string; actorType: string; action: string; target?: string; meta?: Record<string, unknown>; createdAt: string }

export default function AuditPage() {
  const { data, error } = useLoad(() => api<Entry[]>('audit'));
  return (
    <div className="content">
      <div className="page-head"><h1>Audit log</h1><span className="muted">Latest 100 events across the platform.</span></div>
      {error && <div className="alert">{error}</div>}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Tenant</th><th>Details</th></tr></thead>
            <tbody>
              {data?.map((a) => (
                <tr key={a._id}>
                  <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleString()}</td>
                  <td><code>{a.action}</code></td>
                  <td><span className="pill">{a.actorType}</span></td>
                  <td className="small">{a.tenantId ? <a href={`/tenants/${a.tenantId}`}>{a.tenantId.slice(-6)}</a> : '—'}</td>
                  <td className="small muted">{a.target ?? ''} {a.meta ? JSON.stringify(a.meta) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
