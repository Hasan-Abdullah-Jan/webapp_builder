'use client';

import { useState } from 'react';
import { api, pkr } from '@/lib/client';
import { useLoad, useRole } from '@/components/OpsShell';

interface Plan { key: string; name: string; pricePkr: number; active: boolean; limits: { products: number; branches: number; staff: number; ordersPerMonth: number } }
const LIMITS = ['products', 'branches', 'staff', 'ordersPerMonth'] as const;

export default function PlansPage() {
  const role = useRole();
  const { data, error, reload } = useLoad(() => api<Plan[]>('plans'));
  const [edit, setEdit] = useState<Plan | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const canEdit = role === 'owner' || role === 'finance';

  async function save() {
    if (!edit) return;
    try {
      await api(`plans/${edit.key}`, { method: 'PATCH', body: { name: edit.name, pricePkr: edit.pricePkr, active: edit.active, limits: edit.limits } });
      setEdit(null);
      setMsg('Plan saved. Limits apply to new create actions immediately.');
      setErr('');
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="content">
      <div className="page-head"><h1>Plans &amp; pricing</h1><span className="muted">Limits: −1 means unlimited.</span></div>
      {msg && <div className="alert ok" style={{ marginBottom: 12 }}>{msg}</div>}
      {(error || err) && <div className="alert" style={{ marginBottom: 12 }}>{error || err}</div>}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Plan</th><th>Price / month</th>{LIMITS.map((l) => <th key={l}>{l === 'ordersPerMonth' ? 'Orders / mo' : l}</th>)}<th>Active</th><th /></tr></thead>
            <tbody>
              {data?.map((p) => (
                edit?.key === p.key ? (
                  <tr key={p.key}>
                    <td><input className="input" aria-label="Plan name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
                    <td><input className="input" type="number" min={0} aria-label="Price" value={edit.pricePkr} onChange={(e) => setEdit({ ...edit, pricePkr: Number(e.target.value) })} /></td>
                    {LIMITS.map((l) => (
                      <td key={l}><input className="input" type="number" min={-1} aria-label={l} value={edit.limits[l]} onChange={(e) => setEdit({ ...edit, limits: { ...edit.limits, [l]: Number(e.target.value) } })} /></td>
                    ))}
                    <td><input type="checkbox" aria-label="Active" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm" onClick={save}>Save</button> <button className="btn btn-secondary btn-sm" onClick={() => setEdit(null)}>Cancel</button></td>
                  </tr>
                ) : (
                  <tr key={p.key}>
                    <td><strong>{p.name}</strong> <span className="muted small">{p.key}</span></td>
                    <td>{p.pricePkr ? pkr(p.pricePkr) : '—'}</td>
                    {LIMITS.map((l) => <td key={l}>{p.limits[l] < 0 ? '∞' : p.limits[l].toLocaleString()}</td>)}
                    <td>{p.active ? <span className="pill ok">Yes</span> : <span className="pill">No</span>}</td>
                    <td>{canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setEdit(p)}>Edit</button>}</td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
