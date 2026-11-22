'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Percent, Plus, Shuffle } from 'lucide-react';
import { api, money } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { EmptyState, ErrorBox, Field, Modal, PageHeader, SkeletonRows, Switch, fieldErrors, useDialog, useLoad, useToast } from '@/components/ui';

interface Coupon {
  _id: string; code: string; description?: string; type: 'percent' | 'fixed' | 'free_delivery'; value: number; maxDiscount?: number;
  minOrder: number; startsAt?: string; endsAt?: string; usageLimit?: number; usedCount: number; oncePerCustomer: boolean; firstOrderOnly: boolean; active: boolean;
}

function status(c: Coupon) {
  const now = Date.now();
  if (!c.active) return { label: 'Paused', cls: '' };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: 'Expired', cls: 'danger' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: 'Scheduled', cls: 'brand' };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { label: 'Used up', cls: 'warn' };
  return { label: 'Active', cls: 'ok' };
}

function CouponsInner() {
  const { me, can } = useMe();
  const toast = useToast();
  const dialog = useDialog();
  const router = useRouter();
  const params = useSearchParams();
  const list = useLoad(() => api<{ items: Coupon[] }>('coupons?limit=100').then((r) => r.items));
  const [edit, setEdit] = useState<Partial<Coupon> | null>(null);
  const writable = can('site.write');
  const cur = me.tenant.currency;

  useEffect(() => {
    if (params.get('new') === '1' && writable) {
      setEdit({ type: 'percent', value: 10, minOrder: 0, active: true });
      router.replace('/coupons');
    }
  }, [params, writable, router]);

  const describe = (c: Coupon) =>
    c.type === 'percent' ? `${c.value}% off${c.maxDiscount ? ` (max ${money(c.maxDiscount, cur)})` : ''}` : c.type === 'fixed' ? `${money(c.value, cur)} off` : 'Free delivery';

  async function toggle(c: Coupon, active: boolean) {
    try {
      await api(`coupons/${c._id}`, { method: 'PATCH', body: { active } });
      list.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="content">
      <PageHeader title="Discounts" description="Create codes customers enter at checkout. Share them on social media, flyers or WhatsApp."
        actions={writable && <button className="btn" onClick={() => setEdit({ type: 'percent', value: 10, minOrder: 0, active: true })}><Plus size={15} /> Create code</button>} />
      <ErrorBox error={list.error} />
      <div className="card flush">
        {list.loading && !list.data ? <SkeletonRows /> : list.data?.length === 0 ? (
          <EmptyState icon={<Percent size={22} />} title="No discount codes yet" text="Try a welcome offer like WELCOME10 for 10% off a first order."
            action={writable && <button className="btn" onClick={() => setEdit({ code: 'WELCOME10', type: 'percent', value: 10, minOrder: 0, firstOrderOnly: true, active: true })}><Plus size={15} /> Create WELCOME10</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Discount</th><th>Conditions</th><th>Used</th><th>Status</th><th>On</th></tr></thead>
              <tbody>
                {list.data?.map((c) => {
                  const st = status(c);
                  return (
                    <tr key={c._id} className="clickable" onClick={() => writable && setEdit(c)}>
                      <td>
                        <div className="row nowrap">
                          <code style={{ fontSize: 13 }}>{c.code}</code>
                          <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Copy ${c.code}`} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(c.code).then(() => toast('Code copied')); }}><Copy size={14} /></button>
                        </div>
                        {c.description && <div className="small muted">{c.description}</div>}
                      </td>
                      <td className="strong">{describe(c)}</td>
                      <td className="small muted">
                        {[c.minOrder ? `Min. ${money(c.minOrder, cur)}` : null, c.firstOrderOnly ? 'First order' : null, c.oncePerCustomer ? 'Once per customer' : null,
                          c.endsAt ? `Until ${new Date(c.endsAt).toLocaleDateString()}` : null].filter(Boolean).join(' · ') || 'None'}
                      </td>
                      <td>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                      <td><span className={`pill ${st.cls}`}>{st.label}</span></td>
                      <td onClick={(e) => e.stopPropagation()}><Switch label={`${c.code} active`} checked={c.active} disabled={!writable} onChange={(val) => toggle(c, val)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>Make sure <strong>Discount codes</strong> is turned on in Features and your store is published, so customers see the code box at checkout.</p>
      {edit && (
        <CouponForm initial={edit} onClose={() => setEdit(null)} onSaved={(m) => { setEdit(null); list.reload(); toast(m); }}
          confirmDelete={(code) => dialog.confirm({ title: `Delete ${code}?`, message: 'Customers will no longer be able to use it. Past orders keep their discount.', confirmLabel: 'Delete', danger: true })} />
      )}
    </div>
  );
}

export default function CouponsPage() {
  return <Suspense fallback={<div className="content"><SkeletonRows /></div>}><CouponsInner /></Suspense>;
}

const toDateInput = (s?: string) => (s ? new Date(s).toISOString().slice(0, 10) : '');

function CouponForm({ initial, onClose, onSaved, confirmDelete }: { initial: Partial<Coupon>; onClose: () => void; onSaved: (m: string) => void; confirmDelete: (c: string) => Promise<boolean> }) {
  const { me } = useMe();
  const isNew = !initial._id;
  const [f, setF] = useState({
    code: initial.code ?? '', description: initial.description ?? '', type: initial.type ?? 'percent', value: String(initial.value ?? 10),
    maxDiscount: initial.maxDiscount ? String(initial.maxDiscount) : '', minOrder: String(initial.minOrder ?? 0),
    startsAt: toDateInput(initial.startsAt), endsAt: toDateInput(initial.endsAt), usageLimit: initial.usageLimit ? String(initial.usageLimit) : '',
    oncePerCustomer: initial.oncePerCustomer ?? false, firstOrderOnly: initial.firstOrderOnly ?? false, active: initial.active ?? true,
  });
  const [error, setError] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const cur = me.tenant.currency === 'PKR' ? 'Rs.' : me.tenant.currency;

  async function save() {
    setError('');
    if (f.code.trim().length < 3) {
      setErrs({ code: 'Use at least 3 letters or numbers' });
      document.getElementById('cp-code')?.focus();
      return;
    }
    setErrs({});
    setBusy(true);
    const common = {
      description: f.description || undefined, minOrder: Number(f.minOrder) || 0, oncePerCustomer: f.oncePerCustomer, firstOrderOnly: f.firstOrderOnly, active: f.active,
    };
    try {
      if (isNew) {
        await api('coupons', {
          method: 'POST',
          body: {
            ...common, code: f.code.trim().toUpperCase(), type: f.type, value: f.type === 'free_delivery' ? 0 : Number(f.value),
            ...(f.maxDiscount ? { maxDiscount: Number(f.maxDiscount) } : {}), ...(f.usageLimit ? { usageLimit: Number(f.usageLimit) } : {}),
            ...(f.startsAt ? { startsAt: new Date(f.startsAt + 'T00:00:00') } : {}), ...(f.endsAt ? { endsAt: new Date(f.endsAt + 'T23:59:59') } : {}),
          },
        });
      } else {
        await api(`coupons/${initial._id}`, {
          method: 'PATCH',
          body: {
            ...common, ...(f.type !== 'free_delivery' ? { value: Number(f.value) } : {}), maxDiscount: f.maxDiscount ? Number(f.maxDiscount) : null,
            usageLimit: f.usageLimit ? Number(f.usageLimit) : null, startsAt: f.startsAt ? new Date(f.startsAt + 'T00:00:00') : null,
            endsAt: f.endsAt ? new Date(f.endsAt + 'T23:59:59') : null,
          },
        });
      }
      onSaved(`${f.code.toUpperCase()} saved`);
    } catch (e) {
      const fe = fieldErrors(e);
      if ((e as { status?: number }).status === 409) fe.code = 'That code already exists. Try another.';
      if (Object.keys(fe).length) {
        setErrs(fe);
        const first = ['code', 'value', 'endsAt'].find((k) => fe[k]);
        if (first) document.getElementById({ code: 'cp-code', value: 'cp-val', endsAt: 'cp-end' }[first]!)?.focus();
      }
      if (!fe.code && !fe.value && !fe.endsAt) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!(await confirmDelete(initial.code ?? 'this code'))) return;
    try {
      await api(`coupons/${initial._id}`, { method: 'DELETE' });
      onSaved(`${initial.code} deleted`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const randomCode = () => setF({ ...f, code: Math.random().toString(36).slice(2, 8).toUpperCase() });

  return (
    <Modal title={isNew ? 'Create discount code' : `Edit ${initial.code}`} onClose={onClose} wide footer={
      <>
        {!isNew && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : isNew ? 'Create code' : 'Save'}</button>
      </>
    }>
      <div className="stack">
        <ErrorBox error={error} />
        <div className="grid grid-2">
          <Field label="Code" htmlFor="cp-code" hint="Letters and numbers, e.g. EID20" required error={errs.code}>
            <div className="row nowrap">
              <input id="cp-code" className="input" style={{ textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }} disabled={!isNew} maxLength={30} value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() })} />
              {isNew && <button type="button" className="btn btn-secondary btn-icon" title="Generate" aria-label="Generate a random code" onClick={randomCode}><Shuffle size={15} /></button>}
            </div>
          </Field>
          <Field label="Internal note (optional)" htmlFor="cp-desc"><input id="cp-desc" className="input" maxLength={200} placeholder="e.g. Instagram campaign" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Discount type</div>
          <div className="seg" role="group" aria-label="Discount type">
            {([['percent', 'Percentage'], ['fixed', 'Fixed amount'], ['free_delivery', 'Free delivery']] as const).map(([k, l]) => (
              <button key={k} aria-pressed={f.type === k} disabled={!isNew && f.type !== k} onClick={() => setF({ ...f, type: k })}>{l}</button>
            ))}
          </div>
        </div>
        {f.type !== 'free_delivery' && (
          <div className="grid grid-2">
            <Field label={f.type === 'percent' ? 'Percent off' : 'Amount off'} htmlFor="cp-val" required error={errs.value}>
              <div className="input-group">
                {f.type === 'fixed' && <span className="addon">{cur}</span>}
                <input id="cp-val" className="input" type="number" min={1} max={f.type === 'percent' ? 100 : undefined} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
                {f.type === 'percent' && <span className="addon">%</span>}
              </div>
            </Field>
            {f.type === 'percent' && (
              <Field label="Maximum discount (optional)" htmlFor="cp-max"><div className="input-group"><span className="addon">{cur}</span><input id="cp-max" className="input" type="number" min={0} value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} /></div></Field>
            )}
          </div>
        )}
        <div className="grid grid-2">
          <Field label="Minimum order" htmlFor="cp-min"><div className="input-group"><span className="addon">{cur}</span><input id="cp-min" className="input" type="number" min={0} value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} /></div></Field>
          <Field label="Total uses (optional)" htmlFor="cp-lim" hint="Leave empty for unlimited"><input id="cp-lim" className="input" type="number" min={1} value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} /></Field>
          <Field label="Starts (optional)" htmlFor="cp-start"><input id="cp-start" className="input" type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
          <Field label="Ends (optional)" htmlFor="cp-end" error={errs.endsAt}><input id="cp-end" className="input" type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        </div>
        <div className="row">
          <label className="checkbox"><input type="checkbox" checked={f.firstOrderOnly} onChange={(e) => setF({ ...f, firstOrderOnly: e.target.checked })} /> First order only</label>
          <label className="checkbox"><input type="checkbox" checked={f.oncePerCustomer} onChange={(e) => setF({ ...f, oncePerCustomer: e.target.checked })} /> Once per customer</label>
          <label className="checkbox"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        </div>
      </div>
    </Modal>
  );
}
