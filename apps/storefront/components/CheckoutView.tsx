'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { money } from '@/lib/format';
import { useStore } from './StoreProvider';

interface Quote {
  coupon?: { code: string; label: string; discount: number };
  couponError?: string;
  lines: { name: string; quantity: number; lineTotal: number; modifiers: { name: string }[] }[];
  totals: { subtotal: number; deliveryFee: number; discount: number; tax: number; total: number };
  branch: { name: string; prepTimeMins?: number };
}

const SAVED = 'qs-customer';

export function CheckoutView() {
  const { cart, data, setMode, setBranch, clear, feature, v, catalogHref } = useStore();
  const router = useRouter();
  const cur = data.store.currency;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const idemKey = useRef<string>('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED) ?? 'null');
      if (saved) setForm((f) => ({ ...f, name: saved.name ?? '', phone: saved.phone ?? '', address: saved.address ?? '' }));
    } catch {
      /* ignore */
    }
  }, []);

  const payload = {
    type: cart.mode,
    branchId: cart.branchId,
    items: cart.lines.map((l) => ({
      productId: l.productId, quantity: l.quantity, ...(l.variantId ? { variantId: l.variantId } : {}), modifiers: l.modifiers.length ? l.modifiers : undefined,
    })),
    ...(coupon ? { couponCode: coupon } : {}),
  };
  const payloadKey = JSON.stringify(payload);

  // Server-side quote: the browser's prices are display-only.
  useEffect(() => {
    if (!cart.lines.length) return;
    const ctrl = new AbortController();
    setQuoteError('');
    fetch('/api/store/cart/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payloadKey, signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          setQuote(null);
          setQuoteError(body.message ?? 'Something went wrong');
        } else setQuote(body);
      })
      .catch((e) => e.name !== 'AbortError' && setQuoteError('Network error, please retry'));
    idemKey.current = ''; // cart changed → new order attempt
    return () => ctrl.abort();
  }, [payloadKey, cart.lines.length]);

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    if (!idemKey.current) idemKey.current = crypto.randomUUID().replace(/-/g, '');
    setBusy(true);
    try {
      const res = await fetch('/api/store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey.current },
        body: JSON.stringify({
          ...payload,
          customer: {
            name: form.name.trim(),
            phone: form.phone.replace(/[\s-]/g, ''),
            ...(cart.mode === 'delivery' ? { address: form.address.trim() } : {}),
          },
          notes: form.notes.trim() || undefined,
          paymentMethod: 'cod',
          ...(quote?.coupon ? { couponCode: quote.coupon.code } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.details?.[0]?.message ?? body.message ?? 'Could not place the order');
        return;
      }
      try {
        localStorage.setItem(SAVED, JSON.stringify({ name: form.name, phone: form.phone, address: form.address }));
      } catch {
        /* ignore */
      }
      clear();
      router.push(`/order/${body.orderId}?c=${encodeURIComponent(body.trackingCode)}`);
    } catch {
      setSubmitError('Network error. Your order was not placed — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!cart.lines.length) {
    return (
      <div className="container empty">
        <h1>Your cart is empty</h1>
        <Link className="btn" href={catalogHref}>Browse {v.catalog.toLowerCase()}</Link>
      </div>
    );
  }

  const modes = (['delivery', 'pickup'] as const).filter((m) => feature(m));
  const branch = data.branches.find((b) => b._id === cart.branchId);

  return (
    <form className="container checkout" onSubmit={placeOrder}>
      <div className="stack">
        <h1 style={{ fontSize: 30 }}>Checkout</h1>
        {modes.length > 1 && (
          <div className="seg" role="group" aria-label="Delivery or pickup">
            {modes.map((m) => (
              <button type="button" key={m} aria-pressed={cart.mode === m} onClick={() => setMode(m)}>
                {m === 'delivery' ? 'Delivery' : v.pickup}
              </button>
            ))}
          </div>
        )}
        {data.branches.length > 1 && (
          <div className="field">
            <label htmlFor="branch">{cart.mode === 'delivery' ? 'Deliver from' : 'Pick up from'}</label>
            <select id="branch" className="select" value={cart.branchId} onChange={(e) => setBranch(e.target.value)}>
              {data.branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}{b.openNow ? '' : ' (closed)'}</option>
              ))}
            </select>
          </div>
        )}
        {cart.mode === 'pickup' && branch?.address && <div className="notice">Pick up at <strong>{branch.name}</strong>: {branch.address}</div>}

        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" className="input" required maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="phone">Mobile number</label>
          <input
            id="phone" className="input" required inputMode="tel" autoComplete="tel" placeholder="03XX XXXXXXX"
            pattern="\+?[0-9 \-]{7,18}" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <span className="muted small">We&apos;ll send order updates to this number.</span>
        </div>
        {cart.mode === 'delivery' && (
          <div className="field">
            <label htmlFor="address">Delivery address</label>
            <textarea id="address" className="textarea" required maxLength={300} autoComplete="street-address"
              placeholder="House, street, area" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        )}
        <div className="field">
          <label htmlFor="notes">Order notes (optional)</label>
          <input id="notes" className="input" maxLength={500} placeholder="e.g. less spicy, ring the bell" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <fieldset className="group">
          <legend>Payment</legend>
          <label className="opt"><input type="radio" name="pay" defaultChecked /> Cash on {cart.mode === 'delivery' ? 'delivery' : 'pickup'}</label>
          <label className="opt" style={{ opacity: 0.55 }}><input type="radio" name="pay" disabled /> Card / wallet <span className="muted small">(coming soon)</span></label>
        </fieldset>
      </div>

      <aside className="panel stack" aria-live="polite">
        <h2 style={{ fontSize: 20, margin: 0 }}>Order summary</h2>
        {cart.lines.map((l) => (
          <div key={l.key} className="row small" style={{ alignItems: 'flex-start' }}>
            <span><strong>{l.quantity}×</strong> {l.name}{l.modifierNames.length ? <span className="muted"> · {l.modifierNames.join(', ')}</span> : null}</span>
            <span className="spacer" />
            <span>{money(l.unitPrice * l.quantity, cur)}</span>
          </div>
        ))}
        {feature('coupons') && (
          <div className="coupon-box">
            {quote?.coupon ? (
              <div className="row small">
                <span className="coupon-applied">{quote.coupon.code}: {quote.coupon.label}</span>
                <span className="spacer" />
                <button type="button" className="link-btn" onClick={() => { setCoupon(''); setCouponInput(''); }}>Remove</button>
              </div>
            ) : (
              <div className="row nowrap">
                <input className="input" placeholder="Discount code" aria-label="Discount code" value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setCoupon(couponInput.trim()); } }} />
                <button type="button" className="btn btn-outline" disabled={!couponInput.trim()} onClick={() => setCoupon(couponInput.trim())}>Apply</button>
              </div>
            )}
            {coupon && quote?.couponError && <div className="small" style={{ color: '#B42318', marginTop: 6 }}>{quote.couponError}</div>}
          </div>
        )}
        {quoteError && <div className="alert" role="alert">{quoteError}</div>}
        {quote && (
          <div className="totals">
            <div><span>Subtotal</span><span>{money(quote.totals.subtotal, cur)}</span></div>
            {cart.mode === 'delivery' && <div><span>Delivery fee</span><span>{quote.totals.deliveryFee ? money(quote.totals.deliveryFee, cur) : 'Free'}</span></div>}
            {quote.totals.discount > 0 && <div className="discount"><span>Discount ({quote.coupon?.code})</span><span>−{money(quote.totals.discount, cur)}</span></div>}
            {quote.totals.tax > 0 && <div><span>Tax</span><span>{money(quote.totals.tax, cur)}</span></div>}
            <div className="grand"><span>Total</span><span>{money(quote.totals.total, cur)}</span></div>
          </div>
        )}
        {quote?.branch.prepTimeMins ? <p className="muted small" style={{ margin: 0 }}>Ready in about {quote.branch.prepTimeMins} minutes.</p> : null}
        {submitError && <div className="alert" role="alert">{submitError}</div>}
        <button className="btn btn-block" type="submit" disabled={busy || !quote || Boolean(quoteError) || data.preview}>
          {busy ? 'Placing order…' : quote ? `Place order · ${money(quote.totals.total, cur)}` : 'Place order'}
        </button>
      </aside>
    </form>
  );
}
