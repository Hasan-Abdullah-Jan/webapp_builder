'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authCall, publicApi, slugify } from '@/lib/client';
import { ArrowLeft, ArrowRight, Check, Coffee, Croissant, Pill, Scissors, Shirt, ShoppingBasket, Smartphone, Store, UtensilsCrossed, X, type LucideIcon } from 'lucide-react';

interface Template {
  key: string; name: string; description: string; businessTypes: string[]; sampleItems: number;
  theme: { colors: Record<string, string>; fonts: { heading: string; body: string } };
}

const TYPES: { key: string; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'fashion', label: 'Fashion & apparel', icon: Shirt, hint: 'Clothes, shoes, accessories' },
  { key: 'electronics', label: 'Electronics', icon: Smartphone, hint: 'Phones, gadgets, appliances' },
  { key: 'grocery', label: 'Grocery', icon: ShoppingBasket, hint: 'Supermarkets, fresh produce' },
  { key: 'pharmacy', label: 'Pharmacy & health', icon: Pill, hint: 'Medicines, wellness' },
  { key: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed, hint: 'Food delivery & takeaway' },
  { key: 'cafe', label: 'Café', icon: Coffee, hint: 'Coffee, tea, snacks' },
  { key: 'bakery', label: 'Bakery', icon: Croissant, hint: 'Cakes, bread, desserts' },
  { key: 'salon', label: 'Salon & services', icon: Scissors, hint: 'Beauty, grooming, bookings' },
  { key: 'other', label: 'Something else', icon: Store, hint: 'Any other shop' },
];

/**
 * Wizard steps 1–3 (plan §5): business, template, account. Steps 4–8 (brand, features,
 * location, menu, publish) continue in /onboarding once the store exists.
 */
export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const [type, setType] = useState('fashion');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateKey, setTemplateKey] = useState('');
  const [owner, setOwner] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    setSlugOk(null);
    if (slug.length < 3) return;
    const t = setTimeout(() => publicApi(`slug-available?slug=${encodeURIComponent(slug)}`).then((r) => setSlugOk(Boolean(r.available))), 350);
    return () => clearTimeout(t);
  }, [slug]);

  useEffect(() => {
    publicApi<Template[]>(`templates?businessType=${type}`).then((t) => {
      setTemplates(t);
      setTemplateKey((k) => (t.some((x) => x.key === k) ? k : t[0]?.key ?? ''));
    });
  }, [type]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authCall('signup', {
        name: name.trim(), slug, businessType: type, templateKey, sampleData: true,
        owner: { name: owner.name.trim(), email: owner.email.trim(), password: owner.password, ...(owner.phone ? { phone: owner.phone.replace(/[\s-]/g, '') } : {}) },
      });
      router.replace('/onboarding');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="card wizard stack" style={{ maxWidth: 760 }}>
        <div className="brand"><span className="logo-mark"><Store size={16} /></span> QuickStore</div>
        <div className="steps" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className={i <= step ? 'on' : ''} />)}</div>
        {error && <div className="alert" role="alert">{error}</div>}

        {step === 0 && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (slugOk) setStep(1); }}>
            <h1>Let&apos;s set up your store</h1>
            <p className="muted" style={{ marginTop: 0 }}>Your online store, ready in about 10 minutes. No coding, no design skills needed.</p>
            <div className="field">
              <label htmlFor="biz">Business name</label>
              <input id="biz" className="input" required maxLength={120} autoFocus placeholder="e.g. Pizza Point" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="slug">Website address</label>
              <div className="input-group">
                <input id="slug" className="input" required minLength={3} maxLength={40} value={slug}
                  onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
                <span className="addon">.quickstore.pk</span>
              </div>
              {slug.length >= 3 && slugOk !== null && (
                <span className="hint" style={{ color: slugOk ? 'var(--ok)' : 'var(--danger)' }}>
                  {slugOk ? <><Check size={12} /> Available</> : <><X size={12} /> Taken or not allowed, try another</>}
                </span>
              )}
            </div>
            <div className="label">What do you sell?</div>
            <div className="grid grid-3" role="group" aria-label="Business type">
              {TYPES.map((t) => (
                <button type="button" key={t.key} className="choice" aria-pressed={type === t.key} onClick={() => setType(t.key)}>
                  <span className="choice-icon"><t.icon size={18} /></span>
                  <strong style={{ display: 'block' }}>{t.label}</strong>
                  <span className="small muted">{t.hint}</span>
                </button>
              ))}
            </div>
            <div className="row">
              <span className="muted small">Already have a store? <Link href="/login">Log in</Link></span>
              <span className="spacer" />
              <button className="btn btn-lg" disabled={!name.trim() || !slugOk}>Next <ArrowRight size={16} /></button>
            </div>
          </form>
        )}

        {step === 1 && (
          <div className="stack">
            <h1>Pick a look</h1>
            <p className="muted" style={{ marginTop: 0 }}>You can change colours, fonts and sections any time.</p>
            <div className="grid grid-3">
              {templates.map((t) => (
                <button type="button" key={t.key} className="choice" aria-pressed={templateKey === t.key} onClick={() => setTemplateKey(t.key)}>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ background: t.theme.colors.surface, padding: '6px 10px', fontSize: 11, fontWeight: 700, color: t.theme.colors.text }}>{name || 'Your store'}</div>
                    <div style={{ background: t.theme.colors.primary, color: '#fff', padding: '18px 10px 22px', fontWeight: 700 }}>
                      <div style={{ fontSize: 14 }}>{t.name}</div>
                      <span style={{ display: 'inline-block', marginTop: 8, background: t.theme.colors.secondary, color: '#111', fontSize: 10, padding: '3px 8px', borderRadius: 999 }}>Shop now</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 6, background: t.theme.colors.background }}>
                      {[0, 1, 2].map((i) => <div key={i} style={{ aspectRatio: '1', background: t.theme.colors.surface, borderRadius: 4 }} />)}
                    </div>
                  </div>
                  <div className="swatches">
                    {['primary', 'secondary', 'surface', 'text'].map((k) => <span key={k} style={{ background: t.theme.colors[k] }} />)}
                  </div>
                  <strong style={{ display: 'block', marginTop: 8 }}>{t.name}</strong>
                  <span className="muted small">{t.description}</span>
                  <span className="small" style={{ display: 'block', marginTop: 4, color: 'var(--brand)' }}>Includes {t.sampleItems} sample items you can edit</span>
                </button>
              ))}
            </div>
            <div className="row">
              <button className="btn btn-secondary" onClick={() => setStep(0)}><ArrowLeft size={15} /> Back</button>
              <span className="spacer" />
              <button className="btn btn-lg" disabled={!templateKey} onClick={() => setStep(2)}>Next <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form className="stack" onSubmit={create}>
            <h1>Create your account</h1>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="oname">Your name</label>
                <input id="oname" className="input" required maxLength={120} autoComplete="name" value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ophone">Mobile (optional)</label>
                <input id="ophone" className="input" inputMode="tel" autoComplete="tel" value={owner.phone} onChange={(e) => setOwner({ ...owner, phone: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="oemail">Email</label>
              <input id="oemail" className="input" type="email" required autoComplete="email" value={owner.email} onChange={(e) => setOwner({ ...owner, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="opw">Password</label>
              <input id="opw" className="input" type="password" required minLength={8} autoComplete="new-password" value={owner.password} onChange={(e) => setOwner({ ...owner, password: e.target.value })} />
              <span className="hint">At least 8 characters.</span>
            </div>
            <div className="alert info"><Check size={16} /> 14-day free trial with every feature. No card needed.</div>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}><ArrowLeft size={15} /> Back</button>
              <span className="spacer" />
              <button className="btn btn-lg" disabled={busy}>{busy ? 'Creating your store…' : 'Create my store'}</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
