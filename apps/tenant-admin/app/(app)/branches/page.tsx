'use client';

import { useState } from 'react';
import { api, money } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { ErrorBox, useLoad, useToast } from '@/components/ui';
import { BranchForm, DAYS, type Branch } from '@/components/BranchForm';


export default function BranchesPage() {
  const { me, can } = useMe();
  const toast = useToast();
  const list = useLoad(() => api<{ items: Branch[] }>('branches').then((r) => r.items));
  const [edit, setEdit] = useState<Partial<Branch> | null>(null);
  const writable = can('branches.write');
  return (
    <div className="content">
      <div className="page-head">
        <h1>Branches &amp; hours</h1>
        <span className="spacer" />
        {writable && <button className="btn" onClick={() => setEdit({ isOpen: true, deliveryFee: 150, minOrder: 500, prepTimeMins: 30 })}>+ Add branch</button>}
      </div>
      <ErrorBox error={list.error} />
      <div className="grid grid-2">
        {list.data?.map((b) => (
          <div key={b._id} className="card">
            <div className="row">
              <h2 style={{ margin: 0 }}>{b.name}</h2>
              <span className={`pill ${b.isOpen ? 'ok' : 'danger'}`}>{b.isOpen ? 'Open' : 'Closed'}</span>
              <span className="spacer" />
              {writable && <button className="btn btn-secondary btn-sm" onClick={() => setEdit(b)}>Edit</button>}
            </div>
            {b.address && <p className="muted" style={{ marginBottom: 6 }}>{b.address}</p>}
            <p className="small" style={{ margin: 0 }}>
              Delivery fee {money(b.deliveryFee, me.tenant.currency)} · Min order {money(b.minOrder, me.tenant.currency)}
              {b.deliveryRadiusKm ? ` · ${b.deliveryRadiusKm} km radius` : ''} · Ready in ~{b.prepTimeMins ?? 30} min
            </p>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              {b.hours && Object.keys(b.hours).length
                ? DAYS.map(([k, l]) => `${l.slice(0, 3)} ${b.hours?.[k]?.closed ? 'closed' : `${b.hours?.[k]?.open ?? '—'}–${b.hours?.[k]?.close ?? '—'}`}`).join(' · ')
                : 'Open all day (no hours set)'}
            </p>
          </div>
        ))}
      </div>
      {list.data?.length === 0 && <div className="card empty">Add your first location so customers know where you deliver from.</div>}
      {edit && <BranchForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); toast('Branch saved'); }} />}
    </div>
  );
}

