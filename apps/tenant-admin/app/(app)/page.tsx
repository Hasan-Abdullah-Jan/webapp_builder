'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, Package, Palette, Percent, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { api, money, STATUS_LABEL } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { ShareCard } from '@/components/ShareCard';
import { ErrorBox, Skeleton, useLoad } from '@/components/ui';

interface Dash {
  today: { orders: number; revenue: number; averageOrderValue: number };
  liveOrders: number;
  topItems: { name: string; qty: number; revenue: number }[];
  last7Days: { date: string; orders: number; revenue: number }[];
  setup: { ready: boolean; checks: { key: string; label: string; ok: boolean; required: boolean }[] };
  plan: { plan: { name: string } | null; usage: Record<string, { used: number; limit: number }> };
}
interface OrderRow { _id: string; orderNo: number; status: string; createdAt: string; customer?: { name?: string }; totals: { total: number }; type: string }
interface ProductRow { _id: string; name: string; stock?: number; active: boolean }

const CHECK_LINK: Record<string, string> = {
  logo: '/design', category: '/menu', product: '/menu', branch: '/branches', fulfilment: '/features', payment: '/features',
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { me, v, can } = useMe();
  const { data, error } = useLoad(() => api<Dash>('dashboard'));
  const recent = useLoad(() => (can('orders.read') ? api<{ items: OrderRow[] }>('orders?limit=6').then((r) => r.items) : Promise.resolve([])));
  const stock = useLoad(() => (can('catalog.read') ? api<{ items: ProductRow[] }>('products').then((r) => r.items.filter((p) => p.active && typeof p.stock === 'number' && p.stock <= 5)) : Promise.resolve([])));
  const cur = me.tenant.currency;
  const live = me.tenant.status === 'active';
  const done = data?.setup.checks.filter((c) => c.ok).length ?? 0;
  const total = data?.setup.checks.length ?? 1;
  const days = (() => {
    const out: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: me.tenant.timezone });
      const hit = data?.last7Days.find((x) => x.date === d);
      out.push({ date: d, revenue: hit?.revenue ?? 0, orders: hit?.orders ?? 0 });
    }
    return out;
  })();
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const weekRevenue = days.reduce((s, d) => s + d.revenue, 0);

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>{greeting()}, {me.user.name.split(' ')[0]}</h1>
          <p className="desc">Here&apos;s what&apos;s happening at {me.tenant.name} today.</p>
        </div>
        <div className="actions">
          {can('catalog.write') && <Link className="btn btn-secondary" href="/menu?new=1"><Package size={15} /> Add {v.item.toLowerCase()}</Link>}
          {can('orders.read') && <Link className="btn" href="/orders"><Receipt size={15} /> Open orders</Link>}
        </div>
      </div>
      <ErrorBox error={error} />

      {data && !live && (
        <div className="card" style={{ marginBottom: 16, borderColor: '#C7D2FE' }}>
          <div className="card-head">
            <div>
              <h2>Get your store ready</h2>
              <div className="sub">{done} of {total} steps done · customers can order once you publish</div>
            </div>
            <span className="spacer" />
            <Link className="btn" href="/onboarding">Continue setup <ArrowRight size={15} /></Link>
          </div>
          <div className="progress" style={{ marginBottom: 12 }}><div style={{ width: `${(done / total) * 100}%` }} /></div>
          <ul className="check-list">
            {data.setup.checks.map((c) => (
              <li key={c.key}>
                <span className={`check${c.ok ? ' done' : ''}`} aria-hidden>{c.ok && <Check size={13} strokeWidth={3} />}</span>
                <span style={{ flex: 1, color: c.ok ? 'var(--muted)' : undefined, textDecoration: c.ok ? 'line-through' : undefined }}>
                  {c.label.replace('item', v.item.toLowerCase())}{!c.required && <span className="muted small"> · recommended</span>}
                </span>
                {!c.ok && <Link href={CHECK_LINK[c.key] ?? '/'} className="btn btn-secondary btn-sm">Start</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-4">
        {[
          { label: 'Orders today', value: data ? String(data.today.orders) : null, icon: ShoppingBag },
          { label: 'Sales today', value: data ? money(data.today.revenue, cur) : null, icon: Wallet },
          { label: 'Average order', value: data ? money(data.today.averageOrderValue, cur) : null, icon: TrendingUp },
          { label: 'Needs attention', value: data ? String(data.liveOrders) : null, icon: Receipt, href: '/orders', warn: (data?.liveOrders ?? 0) > 0 },
        ].map((s) => {
          const body = (
            <div className="card stat" style={{ height: '100%' }}>
              <div className="label"><s.icon size={15} /> {s.label}</div>
              {s.value === null ? <Skeleton h={30} w={90} /> : <div className="value" style={s.warn ? { color: 'var(--warn)' } : undefined}>{s.value}</div>}
            </div>
          );
          return s.href ? <Link key={s.label} href={s.href} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link> : <div key={s.label}>{body}</div>;
        })}
      </div>

      <div className="cols-2-1" style={{ marginTop: 16 }}>
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div><h2>Sales, last 7 days</h2><div className="sub">{money(weekRevenue, cur)} total</div></div>
              <span className="spacer" />
              <Link href="/reports" className="btn btn-ghost btn-sm">Reports <ArrowRight size={14} /></Link>
            </div>
            {data ? (
              <div className="bar-chart" role="img" aria-label={days.map((d) => `${d.date}: ${money(d.revenue, cur)}`).join(', ')}>
                {days.map((d) => (
                  <div key={d.date} className="bar-col">
                    <div className="bar" style={{ height: `${Math.max(3, (d.revenue / max) * 140)}px`, opacity: d.revenue ? 1 : 0.25 }} title={`${d.orders} orders · ${money(d.revenue, cur)}`} />
                    <span className="bar-label">{new Date(d.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' })}</span>
                  </div>
                ))}
              </div>
            ) : <Skeleton h={170} />}
          </div>

          {can('orders.read') && (
            <div className="card flush">
              <div className="card-head"><h2>Recent orders</h2><span className="spacer" /><Link href="/orders" className="btn btn-ghost btn-sm">View all <ArrowRight size={14} /></Link></div>
              {recent.data && recent.data.length === 0 ? (
                <p className="muted" style={{ padding: '0 20px 20px' }}>No orders yet. Share your store link to get the first one.</p>
              ) : (
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    {(recent.data ?? []).map((o) => (
                      <tr key={o._id}>
                        <td className="strong">#{o.orderNo}</td>
                        <td>{o.customer?.name ?? '—'}</td>
                        <td><span className={`pill ${o.status === 'pending' ? 'warn' : o.status === 'cancelled' ? 'danger' : ['delivered', 'completed'].includes(o.status) ? 'ok' : 'brand'}`}>{STATUS_LABEL[o.status]}</span></td>
                        <td className="muted small">{new Date(o.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td className="right strong">{money(o.totals.total, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="stack">
          {live && <ShareCard />}
          {stock.data && stock.data.length > 0 && (
            <div className="card">
              <div className="card-head"><AlertTriangle size={16} color="var(--warn)" /><h2>Low stock</h2></div>
              {stock.data.slice(0, 6).map((p) => (
                <div key={p._id} className="list-item">
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span className={`pill ${p.stock === 0 ? 'danger' : 'warn'}`}>{p.stock === 0 ? 'Sold out' : `${p.stock} left`}</span>
                </div>
              ))}
              <Link href="/menu" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>Update stock</Link>
            </div>
          )}
          <div className="card">
            <div className="card-head"><h2>Best sellers</h2><span className="sub">30 days</span></div>
            {!data ? <Skeleton h={120} /> : data.topItems.length === 0 ? <p className="muted mb-0">Your best sellers will show up here.</p> : (
              data.topItems.map((t, i) => (
                <div key={t.name} className="list-item">
                  <span className="pill">{i + 1}</span>
                  <span style={{ flex: 1 }}>{t.name}</span>
                  <span className="muted small">{t.qty} sold</span>
                </div>
              ))
            )}
          </div>
          <div className="card">
            <div className="card-head"><h2>Quick actions</h2></div>
            <div className="stack-sm">
              <Link className="btn btn-secondary btn-block" href="/design" style={{ justifyContent: 'flex-start' }}><Palette size={15} /> Customise your website</Link>
              <Link className="btn btn-secondary btn-block" href="/coupons?new=1" style={{ justifyContent: 'flex-start' }}><Percent size={15} /> Create a discount code</Link>
              <Link className="btn btn-secondary btn-block" href="/menu?import=1" style={{ justifyContent: 'flex-start' }}><Package size={15} /> Import {v.items.toLowerCase()} from a spreadsheet</Link>
            </div>
          </div>
          {data && (
            <div className="card">
              <div className="card-head"><h2>Plan usage</h2><span className="pill brand">{data.plan.plan?.name ?? '—'}</span></div>
              <div className="stack-sm">
                {Object.entries(data.plan.usage).map(([k, u]) => {
                  const pct = u.limit < 0 ? 0 : Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100));
                  const label = k === 'products' ? v.items : k === 'branches' ? 'Locations' : 'Staff';
                  return (
                    <div key={k}>
                      <div className="row small"><span>{label}</span><span className="spacer" /><span className="muted">{u.used} / {u.limit < 0 ? 'Unlimited' : u.limit}</span></div>
                      <div className="hbar" style={{ marginTop: 4 }}><div style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--warn)' : undefined }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
