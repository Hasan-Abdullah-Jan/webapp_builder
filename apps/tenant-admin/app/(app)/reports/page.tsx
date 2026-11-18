'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, money } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { ErrorBox, PageHeader, Skeleton, useLoad } from '@/components/ui';

interface Report {
  days: number;
  summary: { orders: number; revenue: number; averageOrderValue: number; discounts: number; deliveryFees: number; cancelled: number; customers: number; repeatCustomerRate: number };
  byDay: { date: string; orders: number; revenue: number }[];
  byItem: { name: string; qty: number; revenue: number }[];
  byType: { type: string; orders: number; revenue: number }[];
  byHour: { hour: number; orders: number }[];
  byCoupon: { code: string; uses: number; discount: number; revenue: number }[];
}

const RANGES = [7, 30, 90, 365];

export default function ReportsPage() {
  const { me, v } = useMe();
  const [days, setDays] = useState(30);
  const { data, error, loading } = useLoad(() => api<Report>(`reports?days=${days}`), [days]);
  const cur = me.tenant.currency;

  // Fill missing days so the chart is continuous.
  const series = (() => {
    if (!data) return [];
    const out: { date: string; revenue: number; orders: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: me.tenant.timezone });
      const hit = data.byDay.find((x) => x.date === d);
      out.push({ date: d, revenue: hit?.revenue ?? 0, orders: hit?.orders ?? 0 });
    }
    if (days > 60) {
      // weekly buckets for long ranges
      const weeks: typeof out = [];
      for (let i = 0; i < out.length; i += 7) {
        const chunk = out.slice(i, i + 7);
        weeks.push({ date: chunk[0].date, revenue: chunk.reduce((s, x) => s + x.revenue, 0), orders: chunk.reduce((s, x) => s + x.orders, 0) });
      }
      return weeks;
    }
    return out;
  })();
  const max = Math.max(1, ...series.map((s) => s.revenue));
  const maxHour = Math.max(1, ...(data?.byHour.map((h) => h.orders) ?? [1]));
  const maxItem = Math.max(1, ...(data?.byItem.map((i) => i.revenue) ?? [1]));

  function exportCsv() {
    if (!data) return;
    const rows = [['date', 'orders', 'revenue'], ...data.byDay.map((d) => [d.date, d.orders, d.revenue])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sales-last-${days}-days.csv`;
    a.click();
  }

  const s = data?.summary;
  return (
    <div className="content">
      <PageHeader title="Reports" description="How your store is doing. Cancelled orders are excluded from sales."
        actions={
          <>
            <div className="seg" role="group" aria-label="Date range">
              {RANGES.map((r) => <button key={r} aria-pressed={days === r} onClick={() => setDays(r)}>{r === 365 ? '12 months' : `${r} days`}</button>)}
            </div>
            <button className="btn btn-secondary" onClick={exportCsv} disabled={!data}><Download size={15} /> Export</button>
            <a className="btn btn-secondary" href="/api/proxy/orders/export.csv"><Download size={15} /> Orders CSV</a>
          </>
        } />
      <ErrorBox error={error} />
      <div className="grid grid-4">
        {[
          ['Sales', s && money(s.revenue, cur)], ['Orders', s && String(s.orders)], ['Average order', s && money(s.averageOrderValue, cur)],
          ['Customers', s && String(s.customers)], ['Returning customers', s && `${s.repeatCustomerRate}%`], ['Discounts given', s && money(s.discounts, cur)],
          ['Delivery fees', s && money(s.deliveryFees, cur)], ['Cancelled', s && String(s.cancelled)],
        ].map(([label, value]) => (
          <div key={label as string} className="card stat">
            <div className="label">{label}</div>
            {loading || !value ? <Skeleton h={28} w={100} /> : <div className="value" style={{ fontSize: 22 }}>{value}</div>}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Sales over time</h2><span className="sub">{days > 60 ? 'by week' : 'by day'}</span></div>
        {!data ? <Skeleton h={170} /> : (
          <div className="bar-chart" style={{ gap: days > 14 && days <= 60 ? 2 : 6 }} role="img" aria-label={`Sales by ${days > 60 ? 'week' : 'day'}`}>
            {series.map((d, i) => (
              <div key={d.date} className="bar-col">
                <div className="bar" style={{ height: `${Math.max(3, (d.revenue / max) * 140)}px`, opacity: d.revenue ? 1 : 0.2 }} title={`${d.date}: ${d.orders} orders · ${money(d.revenue, cur)}`} />
                <span className="bar-label" style={{ visibility: series.length <= 14 || i % Math.ceil(series.length / 8) === 0 ? 'visible' : 'hidden' }}>
                  {new Date(d.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><h2>Top {v.items.toLowerCase()}</h2></div>
          {!data ? <Skeleton h={160} /> : data.byItem.length === 0 ? <p className="muted mb-0">No sales in this period.</p> : data.byItem.slice(0, 10).map((it) => (
            <div key={it.name} style={{ marginBottom: 10 }}>
              <div className="row small"><span className="strong">{it.name}</span><span className="spacer" /><span className="muted">{it.qty} sold · {money(it.revenue, cur)}</span></div>
              <div className="hbar" style={{ marginTop: 4 }}><div style={{ width: `${(it.revenue / maxItem) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Busiest hours</h2></div>
            {!data ? <Skeleton h={110} /> : (
              <div className="bar-chart" style={{ height: 110, gap: 2 }} role="img" aria-label="Orders by hour of day">
                {data.byHour.map((h) => (
                  <div key={h.hour} className="bar-col">
                    <div className="bar" style={{ height: `${Math.max(2, (h.orders / maxHour) * 80)}px`, opacity: h.orders ? 1 : 0.15 }} title={`${h.hour}:00 – ${h.orders} orders`} />
                    <span className="bar-label" style={{ visibility: h.hour % 3 === 0 ? 'visible' : 'hidden' }}>{h.hour}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h2>Delivery vs {v.pickup.toLowerCase()}</h2></div>
            {!data ? <Skeleton h={60} /> : data.byType.length === 0 ? <p className="muted mb-0">No orders yet.</p> : data.byType.map((t) => (
              <div key={t.type} className="list-item"><span style={{ flex: 1, textTransform: 'capitalize' }}>{t.type === 'pickup' ? v.pickup : t.type}</span><span className="muted small">{t.orders} orders</span><span className="strong">{money(t.revenue, cur)}</span></div>
            ))}
          </div>
          {data && data.byCoupon.length > 0 && (
            <div className="card">
              <div className="card-head"><h2>Discount codes</h2></div>
              {data.byCoupon.map((c) => (
                <div key={c.code} className="list-item"><code>{c.code}</code><span className="spacer" /><span className="muted small">{c.uses} uses · {money(c.discount, cur)} off</span></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
