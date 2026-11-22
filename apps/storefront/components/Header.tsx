'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MessageCircle, Search, ShoppingBag, X } from 'lucide-react';
import { useStore } from './StoreProvider';
import { CartDrawer } from './CartDrawer';
import { money } from '@/lib/format';

export function Header() {
  const { data, count, subtotal, openDrawer, drawerOpen, v, catalogHref, href } = useStore();
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const h = data.config.layout.header ?? {};
  const logo = data.config.theme.logo;
  const whatsapp = data.config.settings?.whatsapp?.replace(/[^0-9]/g, '').replace(/^0/, '92');
  const centered = h.variant === 'centered-logo';

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(false);
    router.push(`${catalogHref}?q=${encodeURIComponent(q.trim())}`);
  }

  const brand = (
    <Link href={href('/') } className="brand" aria-label={`${data.store.name} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt={data.store.name} /> : <span>{data.store.name}</span>}
    </Link>
  );

  return (
    <>
      {data.preview && <div className="preview-bar">Preview: this is how your site will look. Ordering is off in preview.</div>}
      <header className={`site-header${h.sticky !== false ? ' sticky' : ''}${centered ? ' centered' : ''}`}>
        <div className="container inner">
          {searching ? (
            <form className="header-search" onSubmit={submitSearch} role="search">
              <Search size={18} aria-hidden />
              <input autoFocus placeholder={`Search ${v.items.toLowerCase()}`} aria-label={`Search ${v.items}`} value={q} onChange={(e) => setQ(e.target.value)} />
              <button type="button" className="icon-btn" onClick={() => setSearching(false)} aria-label="Close search"><X size={18} /></button>
            </form>
          ) : (
            <>
              {centered ? (
                <>
                  <nav aria-label="Main" className="nav-left"><Link href={catalogHref}>{v.catalog}</Link></nav>
                  {brand}
                </>
              ) : (
                <>
                  {brand}
                  <nav aria-label="Main"><Link href={href('/')}>Home</Link><Link href={catalogHref}>{v.catalog}</Link></nav>
                  <span className="spacer" />
                </>
              )}
              <div className="header-actions">
                <button className="icon-btn" onClick={() => setSearching(true)} aria-label={`Search ${v.items}`}><Search size={20} /></button>
                <button className="icon-btn cart-btn" onClick={() => openDrawer(true)} aria-label={`Cart, ${count} items`}>
                  <ShoppingBag size={21} />
                  {count > 0 && <span className="badge">{count}</span>}
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      {!data.store.acceptingOrders && (
        <div className="notice" style={{ borderRadius: 0, textAlign: 'center' }}>
          {data.store.name} isn&apos;t taking online orders right now. Please check back soon.
        </div>
      )}
      {count > 0 && !drawerOpen && (
        <button className="btn floating-cart" onClick={() => openDrawer(true)}>
          <ShoppingBag size={18} /> View cart · {count} {count === 1 ? 'item' : 'items'} · {money(subtotal, data.store.currency)}
        </button>
      )}
      {whatsapp && !data.preview && (
        <a className="wa-float" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">
          <MessageCircle size={26} />
        </a>
      )}
      {drawerOpen && <CartDrawer />}
    </>
  );
}
