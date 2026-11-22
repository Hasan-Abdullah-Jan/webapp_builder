'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { initials, money } from '@/lib/format';
import { useStore } from './StoreProvider';

export function CartDrawer() {
  const { cart, setQty, subtotal, openDrawer, data, catalogHref, v, href } = useStore();
  const router = useRouter();
  const cur = data.store.currency;
  const freeAbove = Number(data.config.settings?.freeDeliveryAbove ?? 0);
  const toFree = freeAbove > 0 && data.config.features?.delivery?.enabled ? freeAbove - subtotal : 0;

  return (
    <Dialog open onClose={() => openDrawer(false)} className="sf-dialog">
      <div className="overlay drawer-overlay">
      <DialogPanel as="aside" className="drawer" aria-label="Your cart">
        <header>
          <DialogTitle as="h2" style={{ margin: 0, fontSize: 20 }}>Your cart</DialogTitle>
          <span className="spacer" />
          <button className="close" onClick={() => openDrawer(false)} aria-label="Close cart"><X size={18} /></button>
        </header>
        {cart.lines.length > 0 && toFree > 0 && (
          <div className="free-bar">
            Add <strong>{money(toFree, cur)}</strong> more for free delivery
            <div className="meter"><div style={{ width: `${Math.min(100, (subtotal / freeAbove) * 100)}%` }} /></div>
          </div>
        )}
        <div className="lines">
          {cart.lines.length === 0 ? (
            <div className="empty">
              <ShoppingBag size={40} strokeWidth={1.5} style={{ opacity: 0.4 }} />
              <p className="muted">Your cart is empty.</p>
              <button className="btn" onClick={() => { openDrawer(false); router.push(catalogHref); }}>Browse {v.catalog.toLowerCase()}</button>
            </div>
          ) : (
            cart.lines.map((l) => (
              <div className="line" key={l.key}>
                <div className="line-thumb">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image} alt="" />
                  ) : <span>{initials(l.name)}</span>}
                </div>
                <div className="info">
                  <strong>{l.name}</strong>
                  {l.modifierNames.length > 0 && <div className="muted small">{l.modifierNames.join(' · ')}</div>}
                  <div className="row" style={{ marginTop: 8 }}>
                    <div className="qty qty-sm" aria-label={`Quantity of ${l.name}`}>
                      <button onClick={() => setQty(l.key, l.quantity - 1)} aria-label="Decrease">{l.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
                      <span>{l.quantity}</span>
                      <button onClick={() => setQty(l.key, l.quantity + 1)} aria-label="Increase"><Plus size={14} /></button>
                    </div>
                    <span className="spacer" />
                    <strong className="small">{money(l.unitPrice * l.quantity, cur)}</strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {cart.lines.length > 0 && (
          <footer>
            <div className="row" style={{ marginBottom: 6 }}>
              <span>Subtotal</span>
              <span className="spacer" />
              <strong>{money(subtotal, cur)}</strong>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>Delivery, discounts and taxes are calculated at checkout.</p>
            <button className="btn btn-block" disabled={!data.store.acceptingOrders || data.preview} onClick={() => { openDrawer(false); router.push(href('/checkout')); }}>
              Checkout
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 6 }} onClick={() => openDrawer(false)}>Continue shopping</button>
          </footer>
        )}
      </DialogPanel>
      </div>
    </Dialog>
  );
}
