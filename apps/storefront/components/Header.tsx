'use client';

import Link from 'next/link';
import { useStore } from './StoreProvider';
import { CartDrawer } from './CartDrawer';
import { money } from '@/lib/format';

export function Header() {
  const { data, count, subtotal, openDrawer, drawerOpen } = useStore();
  const h = data.config.layout.header ?? {};
  const logo = data.config.theme.logo;
  return (
    <>
      {data.preview && <div className="preview-bar">Preview — this is how your site will look. Ordering is off in preview.</div>}
      <header className={`site-header${h.sticky !== false ? ' sticky' : ''}${h.variant === 'centered-logo' ? ' centered' : ''}`}>
        <div className="container inner">
          {h.variant === 'centered-logo' && (
            <nav aria-label="Main">
              <Link href="/menu">Menu</Link>
            </nav>
          )}
          <Link href="/" className="brand" aria-label={`${data.store.name} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt={data.store.name} /> : <span>{data.store.name}</span>}
          </Link>
          {h.variant !== 'centered-logo' && (
            <>
              <nav aria-label="Main">
                <Link href="/">Home</Link>
                <Link href="/menu">Menu</Link>
              </nav>
              <span className="spacer" />
            </>
          )}
          <button className="btn btn-ghost cart-btn" onClick={() => openDrawer(true)} aria-label={`Cart, ${count} items`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6 5 3H2" /><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" />
            </svg>
            {count > 0 && <span className="badge">{count}</span>}
          </button>
        </div>
      </header>
      {!data.store.acceptingOrders && (
        <div className="notice" style={{ borderRadius: 0, textAlign: 'center' }}>
          {data.store.name} is not taking online orders right now. Please check back soon.
        </div>
      )}
      {count > 0 && !drawerOpen && (
        <button className="btn floating-cart" onClick={() => openDrawer(true)}>
          View cart · {count} {count === 1 ? 'item' : 'items'} · {money(subtotal, data.store.currency)}
        </button>
      )}
      {drawerOpen && <CartDrawer />}
    </>
  );
}
