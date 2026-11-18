'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, money, STATUS_LABEL } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { Modal, useToast } from '@/components/ui';

interface Order {
  _id: string;
  orderNo: number;
  status: string;
  type: 'delivery' | 'pickup' | 'dine-in';
  createdAt: string;
  customer?: { name?: string; phone?: string; address?: string };
  items: { name: string; quantity: number; lineTotal: number; unitPrice: number; modifiers?: { name: string; price: number }[] }[];
  totals: { subtotal: number; deliveryFee: number; tax: number; total: number };
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
    case 'ready': return o.type === 'delivery' ? { status: 'out_for_delivery', label: 'Send out' } : { status: 'completed', label: 'Picked up' };
    case 'out_for_delivery': return { status: 'delivered', label: 'Delivered' };
    case 'delivered': return { status: 'completed', label: 'Complete' };
    default: return null;
  }
}

/** Short two-tone chime via WebAudio (no audio files needed). */
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
    /* audio not allowed until the user interacts */
  }
}

const minsAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export default function OrdersPage() {
  const { me, can } = useMe();
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [sound, setSound] = useState(true);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [reason, setReason] = useState('');
  const [printing, setPrinting] = useState<Order | null>(null);
  const [, tick] = useState(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const cur = me.tenant.currency;

  const load = useCallback(async () => {
    try {
      setOrders(await api<Order[]>('orders/board'));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    load();
    const es = new EventSource('/api/proxy/orders/stream');
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener('order.created', (e) => {
      const { orderId, orderNo } = JSON.parse((e as MessageEvent).data);
      setFresh((s) => new Set(s).add(orderId));
      if (soundRef.current) chime();
      toast(`New order #${orderNo}`);
      load();
    });
    es.addEventListener('order.status_changed', () => load());
    const clock = setInterval(() => tick((n) => n + 1), 30_000);
    const fallback = setInterval(load, 60_000); // safety net if the stream drops
    return () => {
      es.close();
      clearInterval(clock);
      clearInterval(fallback);
    };
  }, [load, toast]);

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

  const col = (key: string) =>
    key === 'done'
      ? orders.filter((o) => ['delivered', 'completed', 'cancelled'].includes(o.status))
      : orders.filter((o) => o.status === key);

  return (
    <div className="content" style={{ maxWidth: 'none' }}>
      <div className="page-head no-print">
        <h1>Orders</h1>
        <span className={`pill ${live ? 'ok' : 'warn'}`}>{live ? '● Live' : 'Reconnecting…'}</span>
        <span className="spacer" />
        <label className="checkbox small"><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); if (e.target.checked) chime(); }} /> Sound alerts</label>
        <a className="btn btn-secondary btn-sm" href="/api/proxy/orders/export.csv">Export CSV (30 days)</a>
      </div>

      <div className="board no-print">
        {COLUMNS.filter((c) => c.key !== 'out_for_delivery' || orders.some((o) => o.type === 'delivery')).map((c) => {
          const list = col(c.key);
          return (
            <section key={c.key} className="col" aria-label={c.title}>
              <h3>{c.title} <span className="pill">{list.length}</span></h3>
              {list.length === 0 && <p className="muted small" style={{ padding: '0 4px' }}>Nothing here</p>}
              {list.map((o) => {
                const step = nextStep(o);
                return (
                  <article key={o._id} className={`ticket${fresh.has(o._id) || o.status === 'pending' ? ' new' : ''}`}>
                    <div className="row">
                      <strong>#{o.orderNo}</strong>
                      <span className={`pill ${o.type === 'delivery' ? 'brand' : ''}`}>{o.type}</span>
                      <span className="spacer" />
                      <span className="muted small">{minsAgo(o.createdAt)} min</span>
                    </div>
                    <div className="small" style={{ marginTop: 4 }}>{o.customer?.name} · <a href={`tel:${o.customer?.phone}`}>{o.customer?.phone}</a></div>
                    {o.type === 'delivery' && o.customer?.address && <div className="small muted">{o.customer.address}</div>}
                    <ul className="items">
                      {o.items.map((i, k) => (
                        <li key={k}>{i.quantity}× {i.name}{i.modifiers?.length ? <span className="muted"> ({i.modifiers.map((m) => m.name).join(', ')})</span> : null}</li>
                      ))}
                    </ul>
                    {o.notes && <div className="small" style={{ background: 'var(--warn-soft)', padding: '4px 8px', borderRadius: 6 }}>📝 {o.notes}</div>}
                    <div className="row small" style={{ marginTop: 6 }}>
                      <strong>{money(o.totals.total, cur)}</strong><span className="muted">cash</span>
                      {o.status === 'cancelled' && <span className="pill danger">Cancelled</span>}
                      {['delivered', 'completed'].includes(o.status) && <span className="pill ok">{STATUS_LABEL[o.status]}</span>}
                    </div>
                    {can('orders.update_status') && (
                      <div className="row" style={{ marginTop: 8 }}>
                        {step && <button className="btn btn-sm" onClick={() => move(o, step.status)}>{step.label}</button>}
                        {['pending', 'confirmed', 'preparing'].includes(o.status) && (
                          <button className="btn btn-danger btn-sm" onClick={() => { setRejecting(o); setReason(''); }}>
                            {o.status === 'pending' ? 'Reject' : 'Cancel'}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => { setPrinting(o); setTimeout(() => window.print(), 50); }}>Print</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      {rejecting && (
        <Modal
          title={`${rejecting.status === 'pending' ? 'Reject' : 'Cancel'} order #${rejecting.orderNo}`}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setRejecting(null)}>Keep order</button>
              <button className="btn btn-danger" disabled={reason.trim().length < 3} onClick={async () => { await move(rejecting, 'cancelled', reason.trim()); setRejecting(null); }}>
                Confirm
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="reason">Reason (the customer is told the order was cancelled)</label>
            <select id="reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              <option>Item out of stock</option>
              <option>Kitchen too busy</option>
              <option>Outside delivery area</option>
              <option>Customer unreachable</option>
              <option>Store closing</option>
            </select>
          </div>
        </Modal>
      )}

      {/* Thermal receipt (58/80 mm) — only visible when printing. */}
      {printing && (
        <div className="receipt" style={{ display: 'none' }}>
          <style>{`@media print { .receipt { display:block !important; width: 72mm; font: 12px/1.35 ui-monospace, monospace; } @page { margin: 4mm; } }`}</style>
          <div style={{ textAlign: 'center', fontWeight: 700 }}>{me.tenant.name}</div>
          <div style={{ textAlign: 'center' }}>Order #{printing.orderNo} · {printing.type}</div>
          <div style={{ textAlign: 'center' }}>{new Date(printing.createdAt).toLocaleString()}</div>
          <hr />
          {printing.items.map((i, k) => (
            <div key={k}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{i.quantity}x {i.name}</span><span>{i.lineTotal}</span></div>
              {i.modifiers?.map((m, j) => <div key={j} style={{ paddingLeft: 12 }}>+ {m.name}</div>)}
            </div>
          ))}
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{printing.totals.subtotal}</span></div>
          {printing.totals.deliveryFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delivery</span><span>{printing.totals.deliveryFee}</span></div>}
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
