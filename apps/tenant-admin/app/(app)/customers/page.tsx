'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { ErrorBox, useLoad } from '@/components/ui';

interface Customer { _id: string; name?: string; phone: string; email?: string; addresses?: { line1: string }[]; createdAt: string; marketingOptIn?: boolean }

export default function CustomersPage() {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const list = useLoad(
    () => api<{ items: Customer[]; nextCursor: string | null }>(`customers?limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}${cursor ? `&cursor=${cursor}` : ''}`),
    [q, cursor],
  );
  return (
    <div className="content">
      <div className="page-head">
        <h1>Customers</h1>
        <span className="spacer" />
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search by phone or name" aria-label="Search customers" value={q}
          onChange={(e) => { setCursor(null); setQ(e.target.value); }} />
      </div>
      <ErrorBox error={list.error} />
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>First order</th></tr></thead>
            <tbody>
              {list.data?.items.map((c) => (
                <tr key={c._id}>
                  <td>{c.name ?? '—'}</td>
                  <td><a href={`tel:${c.phone}`}>{c.phone}</a></td>
                  <td className="muted small">{c.addresses?.[c.addresses.length - 1]?.line1 ?? '—'}</td>
                  <td className="muted small">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.items.length === 0 && <div className="empty">Customers appear here after their first order.</div>}
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {cursor && <button className="btn btn-secondary btn-sm" onClick={() => setCursor(null)}>← First page</button>}
        <span className="spacer" />
        {list.data?.nextCursor && <button className="btn btn-secondary btn-sm" onClick={() => setCursor(list.data!.nextCursor)}>Next page →</button>}
      </div>
    </div>
  );
}
