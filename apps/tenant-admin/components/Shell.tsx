'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, authCall, storeUrl } from '@/lib/client';
import { Switch, ToastProvider, useToast } from './ui';

export interface Me {
  tenant: {
    _id: string; name: string; slug: string; status: string; businessType: string; planId: string;
    trialEndsAt?: string; currency: string; timezone: string; acceptingOrders: boolean; templateKey?: string;
  };
  user: { _id: string; name: string; email?: string };
  role: { name: string; permissions: string[] };
  rootDomain: string;
}

const MeCtx = createContext<{ me: Me; reload: () => Promise<void>; can: (p: string) => boolean } | null>(null);
export const useMe = () => {
  const c = useContext(MeCtx);
  if (!c) throw new Error('useMe outside Shell');
  return c;
};

const NAV: { href: string; label: string; icon: string; perm?: string; group?: string }[] = [
  { href: '/', label: 'Dashboard', icon: '◧' },
  { href: '/orders', label: 'Orders', icon: '🧾', perm: 'orders.read' },
  { href: '/menu', label: 'Menu', icon: '🍕', perm: 'catalog.read', group: 'Store' },
  { href: '/branches', label: 'Branches & hours', icon: '📍', perm: 'branches.read' },
  { href: '/customers', label: 'Customers', icon: '👥', perm: 'customers.read' },
  { href: '/design', label: 'Website design', icon: '🎨', perm: 'site.read', group: 'Website' },
  { href: '/features', label: 'Features', icon: '🧩', perm: 'site.read' },
  { href: '/publish', label: 'Publish', icon: '🚀', perm: 'site.read' },
  { href: '/staff', label: 'Staff', icon: '🔑', perm: 'staff.manage', group: 'Settings' },
  { href: '/settings', label: 'Store settings', icon: '⚙️', perm: 'site.write' },
];

function Inner({ me, reload, children }: { me: Me; reload: () => Promise<void>; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const perms = new Set(me.role.permissions);
  const can = useCallback((p: string) => perms.has('*') || perms.has(p), [perms]);
  const live = me.tenant.status === 'active';

  async function toggleOpen(v: boolean) {
    try {
      await api('store/accepting-orders', { method: 'POST', body: { accepting: v } });
      await reload();
      toast(v ? 'Store is open for orders' : 'Store is closed for online orders');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function logout() {
    await authCall('logout').catch(() => {});
    router.replace('/login');
  }

  return (
    <MeCtx.Provider value={{ me, reload, can }}>
      <div className="shell">
        <aside className={`sidebar${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
          <div className="logo">Quick<span>Store</span></div>
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
            <div key={n.href}>
              {n.group && <div className="sep">{n.group}</div>}
              <Link href={n.href} className={(n.href === '/' ? path === '/' : path.startsWith(n.href)) ? 'active' : ''}>
                <span aria-hidden>{n.icon}</span>{n.label}
              </Link>
            </div>
          ))}
          <div className="bottom">
            <div className="sep">Signed in</div>
            <div className="small" style={{ padding: '0 10px 8px' }}>{me.user.name} · {me.role.name}</div>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>↩ Log out</a>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <button className="btn btn-ghost btn-sm menu-toggle" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
            <strong>{me.tenant.name}</strong>
            <span className={`pill ${live ? 'ok' : 'warn'}`}>{live ? 'Live' : 'Draft'}</span>
            {me.tenant.planId === 'trial' && me.tenant.trialEndsAt && (
              <span className="pill brand hide-sm">
                Trial · {Math.max(0, Math.ceil((new Date(me.tenant.trialEndsAt).getTime() - Date.now()) / 86400000))} days left
              </span>
            )}
            <span className="spacer" />
            {live && (
              <label className="row small hide-sm" style={{ gap: 8 }}>
                {me.tenant.acceptingOrders ? 'Taking orders' : 'Closed'}
                <Switch label="Accept online orders" checked={me.tenant.acceptingOrders} onChange={toggleOpen} disabled={!can('orders.update_status')} />
              </label>
            )}
            <a className="btn btn-secondary btn-sm" href={storeUrl(me.tenant.slug)} target="_blank" rel="noreferrer">
              View site ↗
            </a>
          </div>
          {children}
        </div>
      </div>
    </MeCtx.Provider>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>('me'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  if (error) return <div className="empty"><p>{error}</p><a className="btn" href="/login">Log in again</a></div>;
  if (!me) return <div className="empty">Loading…</div>;
  return (
    <ToastProvider>
      <Inner me={me} reload={reload}>{children}</Inner>
    </ToastProvider>
  );
}
