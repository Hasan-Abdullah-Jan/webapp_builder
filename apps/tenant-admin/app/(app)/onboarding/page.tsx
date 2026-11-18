'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { BranchForm, type Branch } from '@/components/BranchForm';
import { PublishPanel } from '@/components/PublishPanel';
import { FeatureGrid } from '@/components/FeatureGrid';
import { ImageUploader, useToast } from '@/components/ui';

interface Preset { key: string; name: string; colors: Record<string, string> }



/** Wizard steps 4–8 (plan §5). Each step autosaves; "Next" always works with defaults. */
export default function OnboardingPage() {
  const { me, v } = useMe();
  const STEPS = ['Brand', 'Features', 'Location & hours', v.catalog === 'Menu' ? 'Menu' : v.items, 'Publish'];
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState('');
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [counts, setCounts] = useState({ products: 0, categories: 0 });

  useEffect(() => {
    api('design/options').then((o) => setPresets(o.presets));
    api('site-config/draft').then((d) => { setColors(d.theme?.colors ?? {}); setLogo(d.theme?.logo ?? ''); });
  }, []);
  useEffect(() => {
    if (step === 2) api<{ items: Branch[] }>('branches').then((r) => setBranches(r.items));
    if (step === 3) {
      Promise.all([api('products'), api('categories')]).then(([p, c]) => setCounts({ products: p.items.length, categories: c.items.length }));
    }
  }, [step]);

  async function saveBrand(next: Record<string, string>, nextLogo = logo) {
    setColors(next);
    try {
      await api('site-config/draft', { method: 'PATCH', body: { theme: { colors: next, ...(nextLogo !== undefined ? { logo: nextLogo } : {}) } } });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="content wizard" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <h1>Set up {me.tenant.name}</h1>
        <span className="spacer" />
        <Link href="/" className="btn btn-ghost btn-sm">Finish later</Link>
      </div>
      <div className="steps" aria-hidden>{STEPS.map((s, i) => <div key={s} className={i <= step ? 'on' : ''} />)}</div>
      <p className="muted small">Step {step + 1} of {STEPS.length}: <strong>{STEPS[step]}</strong></p>

      {step === 0 && (
        <div className="card stack">
          <h2>Your colours</h2>
          <p className="muted" style={{ margin: 0 }}>Pick a palette. You can fine-tune everything later in Website design.</p>
          <div className="grid grid-3">
            {presets.map((p) => (
              <button key={p.key} className="choice" aria-pressed={colors.primary === p.colors.primary} onClick={() => saveBrand(p.colors)}>
                <div style={{ background: p.colors.primary, color: '#fff', padding: '14px 10px', borderRadius: 8, fontWeight: 700 }}>{me.tenant.name}</div>
                <div className="swatches">{['secondary', 'surface', 'text'].map((k) => <span key={k} style={{ background: p.colors[k] }} />)}</div>
                <span className="small">{p.name}</span>
              </button>
            ))}
          </div>
          <ImageUploader label="Logo (optional)" value={logo} onChange={(url) => { setLogo(url); saveBrand(colors, url); }} hint="You can change it any time in Website design." />
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>We switched on what most stores like yours need. Change anything you like.</p>
          <FeatureGrid compact />
        </div>
      )}

      {step === 2 && (
        <div className="card stack">
          <h2>Where are you?</h2>
          {branches && branches.length > 0 ? (
            <div className="alert ok">✓ {branches.map((b) => b.name).join(', ')} saved. You can add more branches later.</div>
          ) : branches ? (
            <BranchForm inline initial={{ isOpen: true, deliveryFee: 150, minOrder: 500, prepTimeMins: 30 }}
              onSaved={() => { toast('Location saved'); api<{ items: Branch[] }>('branches').then((r) => setBranches(r.items)); }} />
          ) : <p className="muted">Loading…</p>}
        </div>
      )}

      {step === 3 && (
        <div className="card stack">
          <h2>Your {v.catalog === 'Menu' ? 'menu' : v.items.toLowerCase()}</h2>
          <p style={{ margin: 0 }}>
            Your store has <strong>{counts.products}</strong> {v.items.toLowerCase()} in <strong>{counts.categories}</strong> {v.categories.toLowerCase()}
            {me.tenant.templateKey ? ' from your template' : ''}.
          </p>
          <p className="muted" style={{ margin: 0 }}>Edit names and prices now, or keep them and change later. Customers only see your site after you publish.</p>
          <div className="row"><Link className="btn btn-secondary" href="/menu">Edit {v.items.toLowerCase()}</Link></div>
        </div>
      )}

      {step === 4 && <PublishPanel />}

      <div className="row" style={{ marginTop: 16 }}>
        {step > 0 && <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
        <span className="spacer" />
        {step < STEPS.length - 1 ? (
          <button className="btn btn-lg" onClick={() => setStep(step + 1)}>Next</button>
        ) : (
          <Link className="btn btn-lg btn-secondary" href="/">Go to dashboard</Link>
        )}
      </div>
    </div>
  );
}
