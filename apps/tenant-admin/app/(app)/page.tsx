'use client';

import Link from 'next/link';
import { api, money, storeUrl } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { useLoad } from '@/components/ui';

interface Dash {
  today: { orders: number; revenue: number; averageOrderValue: number };
  liveOrders: number;
  topItems: { name: string; qty: number; revenue: number }[];
  last7Days: { date: string; orders: number; revenue: number }[];
  setup: { ready: boolean; checks: { key: string; label: string; ok: boolean; required: boolean }[] };
  plan: { plan: { name: string } | null; usage: Record<string, { used: number; limit: number }> };
}

const CHECK_LINK: Record<string, string> = {
  logo: '/design', category: '/menu', product: '/menu', branch: '/branches', fulfilment: '/features', payment: '/features',
};

export default function Dashboard() {
  const { me } = useMe();
  const { data, error } = useLoad(() => api<Dash>('dashboard'));
  const cur = me.tenant.currency;
  const live = me.tenant.status === 'active';
  const max = Math.max(1, ...(data?.last7Days.map((d) => d.revenue) ?? [1]));

  return (
    <div className="content">
      <div className="page-head">
        <h1>Welcome back, {me.user.name.split(' ')[0]}</h1>
        <span className="spacer" />
        {live && <span className="muted small">Your site: <a href={storeUrl(me.tenant.slug)} target="_blank" rel="noreferrer">{storeUrl(me.tenant.slug).replace(/^https?:\/\//, '')}</a></span>}
      </div>
      {error && <div className="alert">{error}</div>}

      {data && !live && (
        <div className="card" style={{ borderColor: '#C7D4FF', background: 'linear-gradient(180deg,#F5F8FF,#fff)' }}>
          <div className="row">
            <h2 style={{ margin: 0 }}>Finish setting up your store</h2>
            <span className="spacer" />
            <Link className="btn" href="/onboarding">Continue setup</Link>
          </div>
          <ul className="check-list" style={{ marginTop: 10 }}>
            {data.setup.checks.map((c) => (
              <li key={c.key}>
                <span className={`check${c.ok ? ' done' : ''}`} aria-hidden>{c.ok ? '✓' : ''}</span>
                <span style={{ flex: 1 }}>{c.label}{!c.required && <span className="muted small"> (recommended)</span>}</span>
                {!c.ok && <Link href={CHECK_LINK[c.key] ?? '/'} className="btn btn-secondary btn-sm">Do it</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <div className="card stat"><div className="label">Orders today</div><div className="value">{data.today.orders}</div></div>
            <div className="card stat"><div className="label">Revenue today</div><div className="value">{money(data.today.revenue, cur)}</div></div>
            <div className="card stat"><div className="label">Average order</div><div className="value">{money(data.today.averageOrderValue, cur)}</div></div>
            <Link href="/orders" className="card stat" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">Live orders</div>
              <div className="value" style={{ color: data.liveOrders ? 'var(--warn)' : undefined }}>{data.liveOrders}</div>
            </Link>
          </div>

          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <h2>Last 7 days</h2>
              {data.last7Days.length === 0 ? (
                <p className="muted">No orders yet. Share your site link to get your first order.</p>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, paddingTop: 8 }} role="img"
                  aria-label={`Revenue by day: ${data.last7Days.map((d) => `${d.date} ${money(d.revenue, cur)}`).join(', ')}`}>
                  {data.last7Days.map((d) => (
                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div title={`${d.orders} orders · ${money(d.revenue, cur)}`}
                        style={{ width: '100%', maxWidth: 36, height: `${Math.max(4, (d.revenue / max) * 120)}px`, background: 'var(--brand)', borderRadius: '6px 6px 2px 2px' }} />
                      <span className="small muted">{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card">
              <h2>Top items (30 days)</h2>
              {data.topItems.length === 0 ? <p className="muted">Nothing sold yet.</p> : (
                <table className="table">
                  <tbody>
                    {data.topItems.map((t) => (
                      <tr key={t.name}><td>{t.name}</td><td className="muted">{t.qty} sold</td><td style={{ textAlign: 'right' }}>{money(t.revenue, cur)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="row"><h2 style={{ margin: 0 }}>Plan usage</h2><span className="pill brand">{data.plan.plan?.name ?? '—'}</span></div>
            <div className="grid grid-3" style={{ marginTop: 12 }}>
              {Object.entries(data.plan.usage).map(([k, u]) => {
                const pct = u.limit < 0 ? 0 : Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100));
                return (
                  <div key={k}>
                    <div className="row small"><span style={{ textTransform: 'capitalize' }}>{k}</span><span className="spacer" /><span className="muted">{u.used} / {u.limit < 0 ? '∞' : u.limit}</span></div>
                    <div style={{ height: 6, background: 'var(--bg)', borderRadius: 6, marginTop: 6 }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: pct >= 80 ? 'var(--warn)' : 'var(--brand)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
