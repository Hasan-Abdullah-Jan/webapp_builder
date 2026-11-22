'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { money, STATUS_LABEL } from '@/lib/format';
import { useStore } from './StoreProvider';

interface Tracked {
  orderNo: number;
  status: string;
  type: 'delivery' | 'pickup';
  statusHistory: { status: string; at: string }[];
  items: { name: string; quantity: number; lineTotal: number; modifiers?: { name: string }[] }[];
  totals: { subtotal: number; deliveryFee: number; tax: number; total: number };
  createdAt: string;
  branch?: { name: string; phone?: string; prepTimeMins?: number } | null;
}

const FLOW: Record<string, string[]> = {
  delivery: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'],
  pickup: ['pending', 'confirmed', 'preparing', 'ready', 'completed'],
};

export function TrackView({ orderId, code }: { orderId: string; code: string }) {
  const { data, href, catalogHref } = useStore();
  const [order, setOrder] = useState<Tracked | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const r = await fetch(href(`/api/store/orders/${encodeURIComponent(orderId)}/track?code=${encodeURIComponent(code)}`), { cache: 'no-store' });
        const body = await r.json();
        if (stop) return;
        if (!r.ok) setError(body.message ?? 'Order not found');
        else setOrder(body);
      } catch {
        /* keep last known state on network blips */
      }
    }
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [orderId, code, href]);

  if (error) {
    return (
      <div className="container empty">
        <h1>We couldn&apos;t find that order</h1>
        <p className="muted">Check the link from your confirmation message.</p>
        <Link href={href('/')} className="btn">Back to the store</Link>
      </div>
    );
  }
  if (!order) return <div className="container empty muted">Loading your order…</div>;

  const flow = FLOW[order.type] ?? FLOW.pickup;
  const at = new Map(order.statusHistory.map((h) => [h.status, h.at]));
  const cancelled = order.status === 'cancelled';
  const idx = flow.indexOf(order.status === 'ready' && order.type === 'delivery' ? 'preparing' : order.status);

  return (
    <div className="container" style={{ maxWidth: 640, padding: '32px 16px 64px' }}>
      <p className="muted" style={{ margin: 0 }}>Order #{order.orderNo}</p>
      <h1 style={{ fontSize: 30 }}>
        {cancelled ? 'Your order was cancelled' : order.status === 'pending' ? 'Thanks! We got your order' : STATUS_LABEL[order.status]}
      </h1>
      {!cancelled && order.status === 'pending' && (
        <p className="muted">{order.branch?.name ?? data.store.name} will confirm it shortly. This page updates automatically.</p>
      )}
      {cancelled ? (
        <div className="alert">If you have questions, call {order.branch?.phone ?? 'the store'}.</div>
      ) : (
        <ol className="timeline" style={{ marginTop: 24 }}>
          {flow.map((s, i) => (
            <li key={s} className={`${i <= idx ? 'done' : ''}${i === idx ? ' current' : ''}`}>
              <span className="dot" aria-hidden />
              <div>
                <strong>{STATUS_LABEL[s]}</strong>
                {at.get(s) && <div className="muted small">{new Date(at.get(s)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="panel stack" style={{ marginTop: 16 }}>
        {order.items.map((i, k) => (
          <div key={k} className="row small">
            <span><strong>{i.quantity}×</strong> {i.name}{i.modifiers?.length ? <span className="muted"> · {i.modifiers.map((m) => m.name).join(', ')}</span> : null}</span>
            <span className="spacer" />
            <span>{money(i.lineTotal, data.store.currency)}</span>
          </div>
        ))}
        <div className="totals">
          {order.totals.deliveryFee > 0 && <div><span>Delivery</span><span>{money(order.totals.deliveryFee, data.store.currency)}</span></div>}
          {order.totals.tax > 0 && <div><span>Tax</span><span>{money(order.totals.tax, data.store.currency)}</span></div>}
          <div className="grand"><span>Total (cash)</span><span>{money(order.totals.total, data.store.currency)}</span></div>
        </div>
      </div>
      {order.branch?.phone && <p className="small" style={{ marginTop: 16 }}>Questions? Call <a href={`tel:${order.branch.phone}`}>{order.branch.phone}</a></p>}
      <Link href={catalogHref} className="btn btn-outline" style={{ marginTop: 8 }}>Shop more</Link>
    </div>
  );
}
