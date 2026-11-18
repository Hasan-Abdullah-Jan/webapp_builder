'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { money } from '@/lib/format';
import { useStore } from './StoreProvider';

export function CartDrawer() {
  const { cart, setQty, subtotal, openDrawer, data } = useStore();
  const router = useRouter();
  const cur = data.store.currency;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openDrawer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openDrawer]);

  return (
    <div className="overlay drawer-overlay" onClick={() => openDrawer(false)} role="presentation">
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Your cart" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 style={{ margin: 0, fontSize: 20 }}>Your order</h2>
          <span className="spacer" />
          <button className="close" onClick={() => openDrawer(false)} aria-label="Close cart">×</button>
        </header>
        <div className="lines">
          {cart.lines.length === 0 ? (
            <div className="empty">
              <p style={{ fontSize: 40, margin: 0 }} aria-hidden>🛒</p>
              <p className="muted">Your cart is empty.</p>
              <button className="btn" onClick={() => { openDrawer(false); router.push('/menu'); }}>Browse the menu</button>
            </div>
          ) : (
            cart.lines.map((l) => (
              <div className="line" key={l.key}>
                <div className="info">
                  <strong>{l.name}</strong>
                  {l.modifierNames.length > 0 && <div className="muted small">{l.modifierNames.join(', ')}</div>}
                  <div className="small" style={{ marginTop: 4 }}>{money(l.unitPrice * l.quantity, cur)}</div>
                </div>
                <div className="qty" aria-label={`Quantity of ${l.name}`}>
                  <button onClick={() => setQty(l.key, l.quantity - 1)} aria-label="Decrease">−</button>
                  <span>{l.quantity}</span>
                  <button onClick={() => setQty(l.key, l.quantity + 1)} aria-label="Increase">+</button>
                </div>
              </div>
            ))
          )}
        </div>
        {cart.lines.length > 0 && (
          <footer>
            <div className="row" style={{ marginBottom: 12 }}>
              <span>Subtotal</span>
              <span className="spacer" />
              <strong>{money(subtotal, cur)}</strong>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>Delivery fee and taxes are calculated at checkout.</p>
            <button
              className="btn btn-block"
              disabled={!data.store.acceptingOrders || data.preview}
              onClick={() => { openDrawer(false); router.push('/checkout'); }}
            >
              Checkout
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
