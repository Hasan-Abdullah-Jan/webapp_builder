'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Download, MessageCircle, Phone, Printer, Receipt, Store, Truck } from 'lucide-react';
import { api, money, STATUS_LABEL } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { Drawer, EmptyState, PageHeader, useDialog, useToast } from '@/components/ui';

interface Order {
  _id: string;
  orderNo: number;
  status: string;
  type: 'delivery' | 'pickup' | 'dine-in';
  createdAt: string;
  customer?: { name?: string; phone?: string; address?: string };
  items: { name: string; variant?: string; quantity: number; lineTotal: number; unitPrice: number; modifiers?: { name: string; price: number }[] }[];
  totals: { subtotal: number; deliveryFee: number; discount: number; tax: number; total: number };
  coupon?: { code: string; label: string; discount: number };
  notes?: string;
  statusHistory: { status: string; at: string; reason?: string }[];
}

const COLUMNS = [
  { key: 'pending', title: 'New' },
  { key: 'confirmed', title: 'Accepted' },
  { key: 'preparing', title: 'Preparing' },
  { key: 'ready', title: 'Ready' },
  { key: 'out_for_delivery', title: 'Out for delivery' },
  { key: 'done', title: 'Done today' },
];

function nextStep(o: Order): { status: string; label: string } | null {
  switch (o.status) {
    case 'pending': return { status: 'confirmed', label: 'Accept' };
    case 'confirmed': return { status: 'preparing', label: 'Start preparing' };
    case 'preparing': return { status: 'ready', label: 'Mark ready' };
    case 'ready': return o.type === 'delivery' ? { status: 'out_for_delivery', label: 'Send out' } : { status: 'completed', label: 'Mark collected' };
    case 'out_for_delivery': return { status: 'delivered', label: 'Mark delivered' };
    case 'delivered': return { status: 'completed', label: 'Complete' };
    default: return null;
  }
}

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t);
      o.stop(t + 0.32);
    });
  } catch {
    /* audio needs a user gesture first */
  }
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};
const waLink = (phone?: string) => (phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '').replace(/^0/, '92')}` : '#');

export default function OrdersPage() {
  const { me, can, v } = useMe();
  const toast = useToast();
  const dialog = useDialog();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [sound, setSound] = useState(true);
  const [open, setOpen] = useState<Order | null>(null);
  const [printing, setPrinting] = useState<Order | null>(null);
  const [, tick] = useState(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const cur = me.tenant.currency;

  const seen = useRef<Set<string> | null>(null);
  const failures = useRef(0);

  /**
   * Polls the board (works on serverless hosts like Vercel, where a long-lived stream can't
   * receive events from other instances). New "pending" orders trigger the chime and a toast.
   */
  const load = useCallback(async (quiet = false) => {
    try {
      const list = await api<Order[]>('orders/board');
      const pendingIds = list.filter((o) => o.status === 'pending').map((o) => o._id);
      if (seen.current) {
        const fresh = list.filter((o) => o.status === 'pending' && !seen.current!.has(o._id));
        if (fresh.length) {
          setFresh((s) => { const n = new Set(s); fresh.forEach((o) => n.add(o._id)); return n; });
          if (soundRef.current) chime();
          toast(fresh.length === 1 ? `New order #${fresh[0].orderNo}` : `${fresh.length} new orders`);
        }
      }
      seen.current = new Set([...(seen.current ?? []), ...pendingIds, ...list.map((o) => o._id)]);
      setOrders(list);
      setOpen((o) => (o ? list.find((x) => x._id === o._id) ?? o : o));
      failures.current = 0;
      setLive(true);
    } catch (e) {
      failures.current++;
      if (failures.current >= 2) setLive(false);
      if (!quiet) toast((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    load();
    // Check every 5 s while the tab is visible, and right away when it becomes visible again.
    const poll = setInterval(() => document.visibilityState === 'visible' && load(true), 5000);
    const onVisible = () => document.visibilityState === 'visible' && load(true);
    document.addEventListener('visibilitychange', onVisible);
    const clock = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  async function move(o: Order, status: string, why?: string) {
    try {
      await api(`orders/${o._id}/status`, { method: 'PATCH', body: { status, ...(why ? { reason: why } : {}) } });
      setFresh((s) => {
        const n = new Set(s);
        n.delete(o._id);
        return n;
      });
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
      load();
    }
  }

  async function reject(o: Order) {
    const reason = await dialog.prompt({
      title: `${o.status === 'pending' ? 'Reject' : 'Cancel'} order #${o.orderNo}?`,
      message: 'The customer will see that the order was cancelled.',
      confirmLabel: o.status === 'pending' ? 'Reject order' : 'Cancel order',
      danger: true,
      prompt: { label: 'Reason', options: ['Out of stock', 'Too busy right now', 'Outside delivery area', 'Customer unreachable', 'Closing soon', 'Other'] },
    });
    if (reason) await move(o, 'cancelled', reason);
  }

  function print(o: Order) {
    setPrinting(o);
    setTimeout(() => window.print(), 60);
  }

  const col = (key: string) =>
    key === 'done'
      ? (orders ?? []).filter((o) => ['delivered', 'completed', 'cancelled'].includes(o.status))
      : (orders ?? []).filter((o) => o.status === key);
  const hasDelivery = (orders ?? []).some((o) => o.type === 'delivery');

  return (
    <div className="content" style={{ maxWidth: 'none' }}>
      <div className="no-print">
        <PageHeader
          title="Orders"
          description={<span className="row" style={{ gap: 6 }}><span className={`pill ${live ? 'ok' : 'warn'}`}><span className="dot" />{live ? 'Live: checking for new orders every few seconds' : 'Connection lost, retrying…'}</span></span>}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => { setSound(!sound); if (!sound) chime(); }} aria-pressed={sound}>
                {sound ? <Bell size={15} /> : <BellOff size={15} />} Sound {sound ? 'on' : 'off'}
              </button>
              <a className="btn btn-secondary" href="/api/proxy/orders/export.csv"><Download size={15} /> Export</a>
            </>
          }
        />
        {orders && orders.length === 0 ? (
          <div className="card"><EmptyState icon={<Receipt size={22} />} title="No orders yet" text="New orders show up here instantly, with a sound alert. Keep this page open during business hours." /></div>
        ) : (
          <div className="board">
            {COLUMNS.filter((c) => c.key !== 'out_for_delivery' || hasDelivery).map((c) => {
              const list = col(c.key);
              return (
                <section key={c.key} className="col" aria-label={c.title}>
                  <h3>{c.title} <span className="pill">{list.length}</span></h3>
                  {!orders && <div className="skeleton" style={{ height: 120 }} />}
                  {orders && list.length === 0 && <p className="faint small" style={{ padding: '0 4px' }}>Nothing here</p>}
                  {list.map((o) => {
                    const step = nextStep(o);
                    return (
                      <article key={o._id} className={`ticket${fresh.has(o._id) || o.status === 'pending' ? ' new' : ''}`} onClick={() => setOpen(o)}
                        tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(o)} aria-label={`Order ${o.orderNo}`}>
                        <div className="row nowrap">
                          <strong>#{o.orderNo}</strong>
                          <span className={`pill ${o.type === 'delivery' ? 'brand' : ''}`}>{o.type === 'delivery' ? <Truck size={12} /> : <Store size={12} />}{o.type === 'pickup' ? v.pickup : o.type}</span>
                          <span className="spacer" />
                          <span className="faint small nowrap">{ago(o.createdAt)}</span>
                        </div>
                        <div className="small" style={{ marginTop: 6 }}>{o.customer?.name}</div>
                        <ul className="items">
                          {o.items.slice(0, 4).map((i, k) => <li key={k}>{i.quantity}× {i.name}{i.variant ? ` (${i.variant})` : ''}</li>)}
                          {o.items.length > 4 && <li className="faint">+{o.items.length - 4} more</li>}
                        </ul>
                        <div className="row nowrap small">
                          <strong>{money(o.totals.total, cur)}</strong>
                          {o.coupon && <span className="pill ok">{o.coupon.code}</span>}
                          {o.status === 'cancelled' && <span className="pill danger">Cancelled</span>}
                          {['delivered', 'completed'].includes(o.status) && <span className="pill ok">{STATUS_LABEL[o.status]}</span>}
                        </div>
                        {can('orders.update_status') && step && (
                          <div className="row nowrap" style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                            <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => move(o, step.status)}>{step.label}</button>
                            {['pending', 'confirmed', 'preparing'].includes(o.status) && <button className="btn btn-danger btn-sm" onClick={() => reject(o)}>{o.status === 'pending' ? 'Reject' : 'Cancel'}</button>}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <Drawer title={`Order #${open.orderNo}`} onClose={() => setOpen(null)}
          actions={<button className="btn btn-ghost btn-sm" onClick={() => print(open)}><Printer size={15} /> Print</button>}>
          <div className="stack">
            <div className="row">
              <span className={`pill ${open.status === 'pending' ? 'warn' : open.status === 'cancelled' ? 'danger' : ['delivered', 'completed'].includes(open.status) ? 'ok' : 'brand'}`}>{STATUS_LABEL[open.status]}</span>
              <span className="pill">{open.type === 'pickup' ? v.pickup : open.type}</span>
              <span className="muted small">{new Date(open.createdAt).toLocaleString()}</span>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="strong">{open.customer?.name}</div>
              <div className="muted small">{open.customer?.phone}</div>
              {open.customer?.address && <div className="small" style={{ marginTop: 4 }}>{open.customer.address}</div>}
              <div className="row" style={{ marginTop: 10 }}>
                <a className="btn btn-secondary btn-sm" href={`tel:${open.customer?.phone}`}><Phone size={14} /> Call</a>
                <a className="btn btn-secondary btn-sm" href={waLink(open.customer?.phone)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
              </div>
            </div>
            {open.notes && <div className="alert warn">Note: {open.notes}</div>}
            <div>
              {open.items.map((i, k) => (
                <div key={k} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <span className="pill">{i.quantity}×</span>
                  <div style={{ flex: 1 }}>
                    <div className="strong">{i.name}{i.variant ? ` · ${i.variant}` : ''}</div>
                    {i.modifiers?.length ? <div className="small muted">{i.modifiers.map((m) => m.name).join(', ')}</div> : null}
                  </div>
                  <span>{money(i.lineTotal, cur)}</span>
                </div>
              ))}
            </div>
            <div className="stack-sm small">
              <div className="row"><span>Subtotal</span><span className="spacer" />{money(open.totals.subtotal, cur)}</div>
              {open.totals.deliveryFee > 0 && <div className="row"><span>Delivery</span><span className="spacer" />{money(open.totals.deliveryFee, cur)}</div>}
              {open.totals.discount > 0 && <div className="row" style={{ color: 'var(--ok)' }}><span>Discount {open.coupon ? `(${open.coupon.code})` : ''}</span><span className="spacer" />−{money(open.totals.discount, cur)}</div>}
              {open.totals.tax > 0 && <div className="row"><span>Tax</span><span className="spacer" />{money(open.totals.tax, cur)}</div>}
              <div className="row strong" style={{ fontSize: 16, borderTop: '1px solid var(--border)', paddingTop: 8 }}><span>Total · cash</span><span className="spacer" />{money(open.totals.total, cur)}</div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>History</div>
              <ul className="timeline">
                {open.statusHistory.map((h, k) => (
                  <li key={k}><span className="tdot" /><div><div className="strong small">{STATUS_LABEL[h.status]}</div><div className="faint small">{new Date(h.at).toLocaleString()}{h.reason ? ` · ${h.reason}` : ''}</div></div></li>
                ))}
              </ul>
            </div>
            {can('orders.update_status') && nextStep(open) && (
              <div className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {['pending', 'confirmed', 'preparing'].includes(open.status) && <button className="btn btn-danger" onClick={() => reject(open)}>{open.status === 'pending' ? 'Reject' : 'Cancel order'}</button>}
                <span className="spacer" />
                <button className="btn" onClick={() => move(open, nextStep(open)!.status)}>{nextStep(open)!.label}</button>
              </div>
            )}
          </div>
        </Drawer>
      )}

      {printing && (
        <div className="receipt" style={{ display: 'none' }}>
          <style>{`@media print { .receipt { display:block !important; width: 72mm; font: 12px/1.35 ui-monospace, monospace; } .dlg-root { display: none !important; } @page { margin: 4mm; } }`}</style>
          <div style={{ textAlign: 'center', fontWeight: 700 }}>{me.tenant.name}</div>
          <div style={{ textAlign: 'center' }}>Order #{printing.orderNo} · {printing.type}</div>
          <div style={{ textAlign: 'center' }}>{new Date(printing.createdAt).toLocaleString()}</div>
          <hr />
          {printing.items.map((i, k) => (
            <div key={k}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{i.quantity}x {i.name}{i.variant ? ` (${i.variant})` : ''}</span><span>{i.lineTotal}</span></div>
              {i.modifiers?.map((m, j) => <div key={j} style={{ paddingLeft: 12 }}>+ {m.name}</div>)}
            </div>
          ))}
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{printing.totals.subtotal}</span></div>
          {printing.totals.deliveryFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delivery</span><span>{printing.totals.deliveryFee}</span></div>}
          {printing.totals.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span>-{printing.totals.discount}</span></div>}
          {printing.totals.tax > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span>{printing.totals.tax}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>TOTAL (cash)</span><span>{printing.totals.total}</span></div>
          <hr />
          <div>{printing.customer?.name} · {printing.customer?.phone}</div>
          {printing.customer?.address && <div>{printing.customer.address}</div>}
          {printing.notes && <div>Note: {printing.notes}</div>}
        </div>
      )}
    </div>
  );
}
