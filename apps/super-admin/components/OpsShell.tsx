'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/client';
import { CreditCard, LayoutDashboard, LogOut, ScrollText, ShieldCheck, Store } from 'lucide-react';

const RoleCtx = createContext<string>('support');
export const useRole = () => useContext(RoleCtx);

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/tenants', label: 'Stores', icon: Store },
  { href: '/plans', label: 'Plans & pricing', icon: CreditCard },
  { href: '/audit', label: 'Audit log', icon: ScrollText, owner: true },
];

export function OpsShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    api<{ role: string }>('me').then((m) => setRole(m.role)).catch(() => {});
  }, []);
  if (!role) return <div className="empty">Loading…</div>;
  return (
    <RoleCtx.Provider value={role}>
      <div className="shell">
        <aside className="sidebar">
          <div className="logo"><ShieldCheck size={18} /> WebApp<span>Builder</span> Ops</div>
          {NAV.filter((n) => !n.owner || role === 'owner').map((n) => (
            <Link key={n.href} href={n.href} className={(n.href === '/' ? path === '/' : path.startsWith(n.href)) ? 'active' : ''}>
              <n.icon size={17} />{n.label}
            </Link>
          ))}
          <div className="bottom">
            <div className="sep">Role: {role}</div>
            <a href="#" onClick={async (e) => { e.preventDefault(); await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }}><LogOut size={16} /> Sign out</a>
          </div>
        </aside>
        <div className="main">{children}</div>
      </div>
    </RoleCtx.Provider>
  );
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    fn().then(setData).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}
