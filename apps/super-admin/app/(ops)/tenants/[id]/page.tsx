'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { api, storeUrl } from '@/lib/client';
import { useLoad, useRole } from '@/components/OpsShell';

interface Detail {
  tenant: { _id: string; name: string; slug: string; status: string; planId: string; businessType: string; createdAt: string; trialEndsAt?: string; acceptingOrders?: boolean };
  owner: { name: string; email?: string; phone?: string } | null;
  domains: { hostname: string; type: string; verified: boolean; primary: boolean }[];
  usage: { products: number; branches: number; staff: number; orders30d: number };
  audit: { _id: string; action: string; actorType: string; target?: string; meta?: { reason?: string }; createdAt: string }[];
}

export default function TenantDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const role = useRole();
  const { data, error, reload } = useLoad(() => api<Detail>(`tenants/${id}`), [id]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function act(path: string, body: unknown, done: string) {
    setErr('');
    try {
      await api(`tenants/${id}/${path}`, { method: 'POST', body });
      setMsg(done);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (error) return <div className="content"><div className="alert">{error}</div></div>;
  if (!data) return <div className="content">Loading…</div>;
  const t = data.tenant;
  const canSuspend = role === 'owner';
  const canReactivate = role === 'owner' || role === 'support';
  const canBill = role === 'owner' || role === 'finance';

  return (
    <div className="content">
      <div className="page-head">
        <Link href="/tenants" className="btn btn-ghost btn-sm">← Tenants</Link>
        <h1>{t.name}</h1>
        <span className={`pill ${t.status === 'active' ? 'ok' : t.status === 'suspended' ? 'danger' : 'warn'}`}>{t.status}</span>
        <span className="pill brand">{t.planId}</span>
        <span className="spacer" />
        <a className="btn btn-secondary btn-sm" href={storeUrl(t.slug)} target="_blank" rel="noreferrer">Open storefront ↗</a>
      </div>
      {msg && <div className="alert ok" style={{ marginBottom: 12 }}>{msg}</div>}
      {err && <div className="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="grid grid-2">
        <div className="card stack">
          <h2>Profile</h2>
          <div className="row"><span className="muted">Owner</span><span className="spacer" />{data.owner ? `${data.owner.name} · ${data.owner.email ?? data.owner.phone ?? ''}` : '—'}</div>
          <div className="row"><span className="muted">Business type</span><span className="spacer" />{t.businessType}</div>
          <div className="row"><span className="muted">Created</span><span className="spacer" />{new Date(t.createdAt).toLocaleString()}</div>
          <div className="row"><span className="muted">Trial ends</span><span className="spacer" />{t.trialEndsAt ? new Date(t.trialEndsAt).toLocaleDateString() : '—'}</div>
          <div className="row"><span className="muted">Taking orders</span><span className="spacer" />{t.acceptingOrders === false ? 'No' : 'Yes'}</div>
          <div><span className="muted">Domains</span>
            {data.domains.map((d) => <div key={d.hostname} className="small">{d.hostname} <span className="pill">{d.type}</span> {d.primary && <span className="pill brand">primary</span>}</div>)}
          </div>
        </div>
        <div className="card stack">
          <h2>Usage</h2>
          <div className="grid grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {Object.entries(data.usage).map(([k, v]) => (
              <div key={k} className="stat"><div className="label">{k === 'orders30d' ? 'Orders (30 days)' : k}</div><div className="value" style={{ fontSize: 22 }}>{v}</div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="card stack" style={{ marginTop: 16 }}>
        <h2>Actions</h2>
        <div className="row">
          {t.status !== 'suspended' ? (
            <button className="btn btn-danger" disabled={!canSuspend} title={canSuspend ? '' : 'Owner role only'} onClick={() => {
              const reason = window.prompt('Reason for suspending (shown in the audit log):');
              if (reason && reason.trim().length >= 3) act('suspend', { reason: reason.trim() }, 'Store suspended. Staff were logged out.');
            }}>Suspend store</button>
          ) : (
            <button className="btn" disabled={!canReactivate} onClick={() => {
              const reason = window.prompt('Reason for reactivating:');
              if (reason && reason.trim().length >= 3) act('reactivate', { reason: reason.trim() }, 'Store reactivated.');
            }}>Reactivate store</button>
          )}
          <select className="select" style={{ maxWidth: 200 }} aria-label="Change plan" disabled={!canBill} value="" onChange={(e) => {
            if (e.target.value && window.confirm(`Change plan to ${e.target.value}?`)) act('plan', { planId: e.target.value }, `Plan changed to ${e.target.value}.`);
          }}>
            <option value="">Change plan…</option>
            {['trial', 'starter', 'pro', 'business', 'enterprise'].filter((p) => p !== t.planId).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="btn btn-secondary" disabled={!canBill && role !== 'support'} onClick={() => act('extend-trial', { days: 7 }, 'Trial extended by 7 days.')}>Extend trial +7 days</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Audit trail</h2>
        <table className="table">
          <tbody>
            {data.audit.map((a) => (
              <tr key={a._id}>
                <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleString()}</td>
                <td><code>{a.action}</code></td>
                <td><span className="pill">{a.actorType}</span></td>
                <td className="small">{a.target ?? ''} {a.meta?.reason ? `— ${a.meta.reason}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
