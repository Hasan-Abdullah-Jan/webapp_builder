'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { ErrorBox, Field, Modal, confirmAction } from '@/components/ui';

export const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;
export type Hours = Record<string, { open: string; close: string; closed?: boolean }>;

export interface Branch {
  _id: string; name: string; address?: string; phone?: string; isOpen: boolean; hours?: Hours;
  deliveryFee?: number; minOrder?: number; deliveryRadiusKm?: number; prepTimeMins?: number;
  geo?: { type: 'Point'; coordinates: [number, number] };
}

export function BranchForm({ initial, onClose, onSaved, inline }: { initial: Partial<Branch>; onClose?: () => void; onSaved: () => void; inline?: boolean }) {
  const [f, setF] = useState({
    name: initial.name ?? '', address: initial.address ?? '', phone: initial.phone ?? '', isOpen: initial.isOpen ?? true,
    deliveryFee: String(initial.deliveryFee ?? 0), minOrder: String(initial.minOrder ?? 0),
    deliveryRadiusKm: String(initial.deliveryRadiusKm ?? 0), prepTimeMins: String(initial.prepTimeMins ?? 30),
    lat: initial.geo ? String(initial.geo.coordinates[1]) : '', lng: initial.geo ? String(initial.geo.coordinates[0]) : '',
  });
  const [useHours, setUseHours] = useState(Boolean(initial.hours && Object.keys(initial.hours).length));
  const [hours, setHours] = useState<Hours>(
    initial.hours && Object.keys(initial.hours).length ? initial.hours : Object.fromEntries(DAYS.map(([k]) => [k, { open: '11:00', close: '23:00' }])),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !initial._id;

  const sameEveryDay = () => {
    const mon = hours.mon;
    setHours(Object.fromEntries(DAYS.map(([k]) => [k, { ...mon }])));
  };

  async function save() {
    setBusy(true);
    setError('');
    const lat = parseFloat(f.lat);
    const lng = parseFloat(f.lng);
    const body: Record<string, unknown> = {
      name: f.name.trim(), address: f.address.trim() || undefined, phone: f.phone.trim() || undefined, isOpen: f.isOpen,
      deliveryFee: Number(f.deliveryFee) || 0, minOrder: Number(f.minOrder) || 0,
      deliveryRadiusKm: Number(f.deliveryRadiusKm) || 0, prepTimeMins: Number(f.prepTimeMins) || 0,
      hours: useHours ? hours : {},
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { geo: { type: 'Point', coordinates: [lng, lat] } } : {}),
    };
    try {
      if (isNew) await api('branches', { method: 'POST', body });
      else await api(`branches/${initial._id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmAction(`Delete branch “${initial.name}”?`)) return;
    try {
      await api(`branches/${initial._id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const form = (
    <div className="stack">
      <ErrorBox error={error} />
      <div className="grid grid-2">
        <Field label="Branch name" htmlFor="b-name"><input id="b-name" className="input" placeholder="e.g. Gulberg" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Branch phone" htmlFor="b-phone"><input id="b-phone" className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <Field label="Address" htmlFor="b-addr"><input id="b-addr" className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      <div className="grid grid-4">
        <Field label="Delivery fee" htmlFor="b-fee"><input id="b-fee" className="input" type="number" min={0} value={f.deliveryFee} onChange={(e) => setF({ ...f, deliveryFee: e.target.value })} /></Field>
        <Field label="Minimum order" htmlFor="b-min"><input id="b-min" className="input" type="number" min={0} value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} /></Field>
        <Field label="Delivery radius (km)" htmlFor="b-rad" hint="0 = no limit"><input id="b-rad" className="input" type="number" min={0} max={200} value={f.deliveryRadiusKm} onChange={(e) => setF({ ...f, deliveryRadiusKm: e.target.value })} /></Field>
        <Field label="Prep time (min)" htmlFor="b-prep"><input id="b-prep" className="input" type="number" min={0} value={f.prepTimeMins} onChange={(e) => setF({ ...f, prepTimeMins: e.target.value })} /></Field>
      </div>
      <div className="grid grid-2">
        <Field label="Latitude" htmlFor="b-lat" hint="Optional; needed for the delivery radius."><input id="b-lat" className="input" inputMode="decimal" placeholder="31.5204" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></Field>
        <Field label="Longitude" htmlFor="b-lng"><input id="b-lng" className="input" inputMode="decimal" placeholder="74.3587" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} /></Field>
      </div>
      <label className="checkbox"><input type="checkbox" checked={f.isOpen} onChange={(e) => setF({ ...f, isOpen: e.target.checked })} /> Branch is open (turn off for holidays)</label>
      <label className="checkbox"><input type="checkbox" checked={useHours} onChange={(e) => setUseHours(e.target.checked)} /> Set opening hours</label>
      {useHours && (
        <div className="card" style={{ padding: 12 }}>
          {DAYS.map(([k, label]) => (
            <div key={k} className="row" style={{ marginBottom: 6 }}>
              <span style={{ width: 96 }}>{label}</span>
              <input className="input" type="time" aria-label={`${label} opens`} style={{ width: 120 }} disabled={hours[k]?.closed} value={hours[k]?.open ?? ''} onChange={(e) => setHours({ ...hours, [k]: { ...hours[k], open: e.target.value } })} />
              <span>–</span>
              <input className="input" type="time" aria-label={`${label} closes`} style={{ width: 120 }} disabled={hours[k]?.closed} value={hours[k]?.close ?? ''} onChange={(e) => setHours({ ...hours, [k]: { ...hours[k], close: e.target.value } })} />
              <label className="checkbox small"><input type="checkbox" checked={Boolean(hours[k]?.closed)} onChange={(e) => setHours({ ...hours, [k]: { ...hours[k], closed: e.target.checked } })} /> Closed</label>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={sameEveryDay}>Same as Monday every day</button>
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="stack">
        {form}
        <button className="btn" disabled={busy || !f.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save location'}</button>
      </div>
    );
  }
  return (
    <Modal title={isNew ? 'Add branch' : `Edit ${initial.name}`} onClose={onClose!} wide footer={
      <>
        {!isNew && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy || !f.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </>
    }>
      {form}
    </Modal>
  );
}
