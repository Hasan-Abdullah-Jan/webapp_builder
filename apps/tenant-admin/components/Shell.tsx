'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3, ChevronRight, ExternalLink, LayoutDashboard, LogOut, Menu as MenuIcon, Package, Palette, Percent,
  Plus, Puzzle, Receipt, Rocket, Search, Settings, Store, Users, UserCog, MapPin, type LucideIcon,
} from 'lucide-react';
import { api, authCall, storeUrl } from '@/lib/client';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { DialogProvider, Modal, Switch, ToastProvider, useToast } from './ui';
import { ThemeSwitch } from './ThemeSwitch';

export interface Vocab {
  catalog: string; item: string; items: string; category: string; categories: string;
  options: string; cta: string; pickup: string; orderVerb: string; emptyCatalog: string;
}

export interface Me {
  tenant: {
    _id: string; name: string; slug: string; status: string; businessType: string; planId: string;
    trialEndsAt?: string; currency: string; timezone: string; acceptingOrders: boolean; templateKey?: string;
  };
  user: { _id: string; name: string; email?: string };
  role: { name: string; permissions: string[] };
  vocab: Vocab;
  rootDomain: string;
}

const MeCtx = createContext<{ me: Me; reload: () => Promise<void>; can: (p: string) => boolean; v: Vocab } | null>(null);
export const useMe = () => {
  const c = useContext(MeCtx);
  if (!c) throw new Error('useMe outside Shell');
  return c;
};

interface NavItem { href: string; label: string; icon: LucideIcon; perm?: string; group?: string; keywords?: string }

function navFor(v: Vocab): NavItem[] {
  return [
    { href: '/', label: 'Home', icon: LayoutDashboard, keywords: 'dashboard overview' },
    { href: '/orders', label: 'Orders', icon: Receipt, perm: 'orders.read', keywords: 'live board kitchen' },
    { href: '/menu', label: v.catalog === 'Menu' ? 'Menu' : v.items, icon: Package, perm: 'catalog.read', group: 'Store', keywords: 'products items catalogue menu services' },
    { href: '/customers', label: 'Customers', icon: Users, perm: 'customers.read', keywords: 'clients' },
    { href: '/coupons', label: 'Discounts', icon: Percent, perm: 'site.read', keywords: 'coupons codes promotions' },
    { href: '/reports', label: 'Reports', icon: BarChart3, perm: 'orders.read', keywords: 'analytics sales' },
    { href: '/design', label: 'Website design', icon: Palette, perm: 'site.read', group: 'Online store', keywords: 'theme builder colours sections' },
    { href: '/features', label: 'Features', icon: Puzzle, perm: 'site.read', keywords: 'modules toggles delivery pickup' },
    { href: '/publish', label: 'Publish', icon: Rocket, perm: 'site.read', keywords: 'go live versions' },
    { href: '/branches', label: 'Locations & hours', icon: MapPin, perm: 'branches.read', group: 'Settings', keywords: 'branches delivery fee opening' },
    { href: '/staff', label: 'Staff', icon: UserCog, perm: 'staff.manage', keywords: 'team roles' },
    { href: '/settings', label: 'Store settings', icon: Settings, perm: 'site.write', keywords: 'name timezone currency' },
  ];
}

function CommandPalette({ nav, onClose, v }: { nav: NavItem[]; onClose: () => void; v: Vocab }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const actions = useMemo(() => [
    { label: `Add ${v.item.toLowerCase()}`, run: () => router.push('/menu?new=1'), icon: Plus, keywords: 'new create product item' },
    { label: 'Create discount code', run: () => router.push('/coupons?new=1'), icon: Percent, keywords: 'coupon' },
    { label: 'Open live orders', run: () => router.push('/orders'), icon: Receipt, keywords: 'board' },
    { label: 'View my website', run: () => window.open(document.querySelector<HTMLAnchorElement>('#view-site')?.href ?? '/', '_blank'), icon: ExternalLink, keywords: 'store site' },
  ], [router, v]);
  const items = [
    ...actions.map((a) => ({ group: 'Actions', label: a.label, icon: a.icon, run: a.run, keywords: a.keywords })),
    ...nav.map((n) => ({ group: 'Go to', label: n.label, icon: n.icon, run: () => router.push(n.href), keywords: n.keywords ?? '' })),
  ].filter((x) => !q || `${x.label} ${x.keywords}`.toLowerCase().includes(q.toLowerCase()));

  function go(idx: number) {
    const it = items[idx];
    if (!it) return;
    onClose();
    it.run();
  }
  return (
    <Dialog open onClose={onClose} className="dlg-root">
      <DialogBackdrop className="dlg-backdrop" />
      <div className="dlg-wrap">
      <DialogPanel className="modal palette" aria-label="Search pages and actions">
        <div className="p-input">
          <Search size={18} className="faint" />
          <input autoFocus placeholder="Search pages and actions…" value={q} aria-label="Search pages and actions"
            onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
              if (e.key === 'Enter') go(i);
              if (e.key === 'Escape') onClose();
            }} />
          <span className="kbd">Esc</span>
        </div>
        <ul role="listbox">
          {items.length === 0 && <li className="muted" style={{ padding: 12 }}>No matches</li>}
          {items.map((it, idx) => (
            <li key={`${it.group}-${it.label}`}>
              {(idx === 0 || items[idx - 1].group !== it.group) && <div className="group-label">{it.group}</div>}
              <button className={idx === i ? 'on' : ''} role="option" aria-selected={idx === i} onMouseEnter={() => setI(idx)} onClick={() => go(idx)}>
                <it.icon size={16} /> {it.label}
                <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: .4 }} />
              </button>
            </li>
          ))}
        </ul>
      </DialogPanel>
      </div>
    </Dialog>
  );
}

function Inner({ me, reload, children }: { me: Me; reload: () => Promise<void>; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [newOrders, setNewOrders] = useState(0);
  const perms = useMemo(() => new Set(me.role.permissions), [me.role.permissions]);
  const can = useCallback((p: string) => perms.has('*') || perms.has(p), [perms]);
  const v = me.vocab;
  const nav = navFor(v).filter((n) => !n.perm || can(n.perm));
  const live = me.tenant.status === 'active';
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  // Badge with the number of new (unaccepted) orders.
  useEffect(() => {
    if (!can('orders.read')) return;
    const load = () => api<{ items: unknown[] }>('orders?status=pending&limit=99').then((r) => setNewOrders(r.items.length)).catch(() => {});
    load();
    pollRef.current = setInterval(load, 30_000);
    return () => clearInterval(pollRef.current);
  }, [can, path]);

  async function toggleOpen(val: boolean) {
    try {
      await api('store/accepting-orders', { method: 'POST', body: { accepting: val } });
      await reload();
      toast(val ? 'Your store is taking orders' : 'Online orders are paused');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function logout() {
    await authCall('logout').catch(() => {});
    router.replace('/login');
  }

  const trialDays = me.tenant.planId === 'trial' && me.tenant.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(me.tenant.trialEndsAt).getTime() - Date.now()) / 86400000)) : null;

  return (
    <MeCtx.Provider value={{ me, reload, can, v }}>
      <div className="shell">
        <div className={`backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
        <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
          <div className="store-switch">
            <div className="store-avatar" aria-hidden>{me.tenant.name.slice(0, 1).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="store-name">{me.tenant.name}</div>
              <div className="store-sub">{live ? 'Live' : 'Not published yet'}</div>
            </div>
          </div>
          {nav.map((n) => {
            const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
            return (
              <div key={n.href}>
                {n.group && <div className="sep">{n.group}</div>}
                <Link href={n.href} className={`nav${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <n.icon size={17} /> {n.label}
                  {n.href === '/orders' && newOrders > 0 && <span className="nav-count" aria-label={`${newOrders} new orders`}>{newOrders}</span>}
                </Link>
              </div>
            );
          })}
          <div className="bottom">
            <div className="row" style={{ padding: '0 8px 10px' }}><span className="small muted">Appearance</span><span className="spacer" /><ThemeSwitch /></div>
            {trialDays !== null && (
              <div className="card" style={{ padding: 12, marginBottom: 10, background: 'var(--brand-soft)', borderColor: 'var(--border-strong)' }}>
                <div className="strong small" style={{ color: 'var(--brand-text)' }}>Free trial · {trialDays} days left</div>
                <div className="small muted">All Pro features included.</div>
              </div>
            )}
            <div className="row nowrap" style={{ padding: '4px 8px' }}>
              <div className="store-avatar" style={{ width: 28, height: 28, fontSize: 12, background: 'var(--faint)' }} aria-hidden>
                {me.user.name.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="small strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.user.name}</div>
                <div className="small muted">{me.role.name}</div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={16} /></button>
            </div>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <button className="btn btn-ghost btn-icon menu-toggle" onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon size={18} /></button>
            <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Search (Ctrl+K)">
              <Search size={15} /> <span className="label">Search or jump to…</span> <span className="kbd">Ctrl K</span>
            </button>
            <span className="spacer" />
            {live ? (
              <label className="row nowrap small hide-sm" style={{ gap: 8, color: 'var(--text-2)' }}>
                <span className={`pill ${me.tenant.acceptingOrders ? 'ok' : 'warn'}`}><span className="dot" />{me.tenant.acceptingOrders ? 'Taking orders' : 'Orders paused'}</span>
                <Switch label="Accept online orders" checked={me.tenant.acceptingOrders} onChange={toggleOpen} disabled={!can('orders.update_status')} />
              </label>
            ) : (
              <Link href="/publish" className="pill warn hide-sm" style={{ textDecoration: 'none' }}><Rocket size={12} /> Not live yet: publish</Link>
            )}
            <a id="view-site" className="btn btn-secondary btn-sm" href={storeUrl(me.tenant.slug)} target="_blank" rel="noreferrer">
              <Store size={14} /> <span className="hide-sm">View store</span>
            </a>
          </div>
          {children}
        </div>
      </div>
      {palette && <CommandPalette nav={nav} v={v} onClose={() => setPalette(false)} />}
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

  if (error) {
    return (
      <Modal title="Couldn't load your store" onClose={() => (window.location.href = '/login')}>
        <p>{error}</p>
        <a className="btn" href="/login">Log in again</a>
      </Modal>
    );
  }
  if (!me) {
    return (
      <div className="shell">
        <aside className="sidebar"><div className="skeleton" style={{ height: 40, marginBottom: 16 }} />{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 30, marginBottom: 6 }} />)}</aside>
        <div className="main"><div className="topbar" /><div className="content"><div className="skeleton" style={{ height: 28, width: 240, marginBottom: 20 }} /><div className="skeleton" style={{ height: 160 }} /></div></div>
      </div>
    );
  }
  return (
    <ToastProvider>
      <DialogProvider>
        <Inner me={me} reload={reload}>{children}</Inner>
      </DialogProvider>
    </ToastProvider>
  );
}
