'use client';

import Link from 'next/link';
import { api, pkr } from '@/lib/client';
import { useLoad } from '@/components/OpsShell';

interface Overview {
  tenantsByStatus: Record<string, number>;
  signupsLast14Days: { date: string; count: number }[];
  last24h: { orders: number; gmv: number };
  mrrPkr: number;
  stuckInDraft: number;
}

export default function OverviewPage() {
  const { data, error } = useLoad(() => api<Overview>('overview'));
  const total = Object.values(data?.tenantsByStatus ?? {}).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...(data?.signupsLast14Days.map((s) => s.count) ?? [1]));
  return (
    <div className="content">
      <div className="page-head"><h1>Platform overview</h1></div>
      {error && <div className="alert">{error}</div>}
      {data && (
        <>
          <div className="grid grid-4">
            <div className="card stat"><div className="label">Tenants</div><div className="value">{total}</div></div>
            <div className="card stat"><div className="label">Live stores</div><div className="value">{data.tenantsByStatus.active ?? 0}</div></div>
            <div className="card stat"><div className="label">Orders (24h)</div><div className="value">{data.last24h.orders}</div></div>
            <div className="card stat"><div className="label">GMV (24h)</div><div className="value">{pkr(data.last24h.gmv)}</div></div>
          </div>
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <h2>Sign-ups, last 14 days</h2>
              {data.signupsLast14Days.length === 0 ? <p className="muted">No sign-ups yet.</p> : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }} role="img"
                  aria-label={data.signupsLast14Days.map((s) => `${s.date}: ${s.count}`).join(', ')}>
                  {data.signupsLast14Days.map((s) => (
                    <div key={s.date} style={{ flex: 1, textAlign: 'center' }}>
                      <div title={`${s.date}: ${s.count}`} style={{ height: `${(s.count / max) * 110 + 4}px`, background: 'var(--brand)', borderRadius: '6px 6px 2px 2px' }} />
                      <span className="small muted">{s.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card stack">
              <h2>Health</h2>
              <div className="row"><span>MRR (active stores on paid plans)</span><span className="spacer" /><strong>{pkr(data.mrrPkr)}</strong></div>
              <div className="row"><span>By status</span><span className="spacer" />
                {Object.entries(data.tenantsByStatus).map(([k, v]) => <span key={k} className={`pill ${k === 'active' ? 'ok' : k === 'suspended' ? 'danger' : 'warn'}`}>{k} {v}</span>)}
              </div>
              <div className="row">
                <span>Stuck in draft for more than 3 days</span><span className="spacer" />
                <Link href="/tenants?status=draft" className={`pill ${data.stuckInDraft ? 'warn' : ''}`}>{data.stuckInDraft} to follow up</Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
