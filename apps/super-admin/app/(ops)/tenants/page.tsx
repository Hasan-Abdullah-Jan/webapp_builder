'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/client';
import { useLoad } from '@/components/OpsShell';

interface Tenant { _id: string; name: string; slug: string; status: string; planId: string; businessType: string; createdAt: string; trialEndsAt?: string }

const STATUS_PILL: Record<string, string> = { active: 'ok', draft: 'warn', suspended: 'danger', provisioning_failed: 'danger', deleted: '' };

function TenantsInner() {
  const sp = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [plan, setPlan] = useState('');
  const { data, error } = useLoad(
    () => api<{ items: Tenant[] }>(`tenants?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}${plan ? `&plan=${plan}` : ''}`),
    [q, status, plan],
  );
  return (
    <div className="content">
      <div className="page-head"><h1>Tenants</h1></div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search name or address" aria-label="Search tenants" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ maxWidth: 180 }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['active', 'draft', 'suspended', 'provisioning_failed'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 160 }} aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">All plans</option>
          {['trial', 'starter', 'pro', 'business', 'enterprise'].map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Store</th><th>Address</th><th>Type</th><th>Plan</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {data?.items.map((t) => (
                <tr key={t._id}>
                  <td><Link href={`/tenants/${t._id}`}><strong>{t.name}</strong></Link></td>
                  <td className="muted">{t.slug}</td>
                  <td>{t.businessType}</td>
                  <td><span className="pill brand">{t.planId}</span></td>
                  <td><span className={`pill ${STATUS_PILL[t.status] ?? ''}`}>{t.status}</span></td>
                  <td className="muted small">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.items.length === 0 && <div className="empty">No tenants match.</div>}
        </div>
      </div>
    </div>
  );
}

export default function TenantsPage() {
  return <Suspense fallback={<div className="content">Loading…</div>}><TenantsInner /></Suspense>;
}
