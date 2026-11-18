'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, storeUrl } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { Field, confirmAction, useToast } from '@/components/ui';

type Props = Record<string, string | number | boolean>;
interface Section { type: string; props: Props }
interface Draft {
  theme: { colors?: Record<string, string>; fonts?: { heading?: string; body?: string }; radius?: string; buttonStyle?: string; mode?: string; logo?: string; favicon?: string; customCss?: string };
  layout: { header?: { variant?: string; sticky?: boolean }; footer?: { variant?: string; text?: string }; productCard?: { imageRatio?: string; showDescription?: boolean }; home?: Section[] };
  seo: { title?: string; description?: string; ogImage?: string };
  settings: { taxPercent?: number; freeDeliveryAbove?: number; phone?: string; whatsapp?: string; instagram?: string; facebook?: string; aboutText?: string };
}
interface Options {
  presets: { key: string; name: string; colors: Record<string, string> }[];
  fonts: { key: string; heading: string; body: string }[];
  sections: string[];
  templates: { key: string; name: string; description: string }[];
}

const SECTION_NAMES: Record<string, string> = {
  announcement: 'Announcement bar', heroBanner: 'Hero banner', categoryStrip: 'Category strip', featuredProducts: 'Featured items',
  menuGrid: 'Menu grid', about: 'About us', branchList: 'Branch locations', richText: 'Text block',
};
const SECTION_FIELDS: Record<string, { key: string; label: string; kind: 'text' | 'textarea' | 'number' | 'url'; min?: number; max?: number }[]> = {
  announcement: [{ key: 'text', label: 'Text', kind: 'text' }],
  heroBanner: [
    { key: 'title', label: 'Headline', kind: 'text' }, { key: 'subtitle', label: 'Sub-headline', kind: 'text' },
    { key: 'cta', label: 'Button text', kind: 'text' }, { key: 'image', label: 'Background image URL', kind: 'url' },
  ],
  categoryStrip: [{ key: 'title', label: 'Title (optional)', kind: 'text' }],
  featuredProducts: [
    { key: 'title', label: 'Title', kind: 'text' }, { key: 'tag', label: 'Show items tagged', kind: 'text' },
    { key: 'limit', label: 'How many', kind: 'number', min: 1, max: 12 },
  ],
  menuGrid: [
    { key: 'title', label: 'Title', kind: 'text' }, { key: 'columns', label: 'Columns', kind: 'number', min: 1, max: 4 },
    { key: 'categories', label: 'Categories to show', kind: 'number', min: 1, max: 20 },
  ],
  about: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Your story', kind: 'textarea' }],
  richText: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Text', kind: 'textarea' }],
  branchList: [{ key: 'title', label: 'Title', kind: 'text' }],
};
const COLOR_LABELS: Record<string, string> = { primary: 'Brand colour', secondary: 'Accent', background: 'Background', surface: 'Panels', text: 'Text' };
const DEVICES = { desktop: '100%', tablet: '820px', mobile: '390px' } as const;

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const isHex = (s?: string) => Boolean(s && /^#[0-9a-fA-F]{6}$/.test(s));

export default function DesignPage() {
  const { me, can } = useMe();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [opts, setOpts] = useState<Options | null>(null);
  const [token, setToken] = useState('');
  const [tab, setTab] = useState<'theme' | 'sections' | 'layout' | 'info'>('theme');
  const [selected, setSelected] = useState<number | null>(null);
  const [device, setDevice] = useState<keyof typeof DEVICES>('desktop');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error' | 'dirty'>('saved');
  const [saveError, setSaveError] = useState('');
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);
  const lastPush = useRef(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const writable = can('site.write');
  const base = storeUrl(me.tenant.slug);
  const origin = useMemo(() => new URL(base).origin, [base]);

  useEffect(() => {
    Promise.all([api<Draft>('site-config/draft'), api<Options>('design/options'), api<{ token: string }>('site-config/preview-token')])
      .then(([d, o, t]) => {
        setDraft({ theme: d.theme ?? {}, layout: d.layout ?? {}, seo: d.seo ?? {}, settings: d.settings ?? {} });
        setOpts(o);
        setToken(t.token);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [toast]);

  const post = useCallback((msg: unknown) => frame.current?.contentWindow?.postMessage(msg, origin), [origin]);

  // Preview → builder messages.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== origin) return;
      if (e.data?.type === 'qs:ready' && draft) post({ type: 'qs:config', config: draft });
      if (e.data?.type === 'qs:section-click' && typeof e.data.index === 'number') {
        setTab('sections');
        setSelected(e.data.index);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [origin, draft, post]);

  useEffect(() => {
    post({ type: 'qs:select', index: tab === 'sections' ? selected : null });
  }, [selected, tab, post]);

  const save = useCallback(async (d: Draft) => {
    setSaveState('saving');
    try {
      // Send only keys the API accepts, so older drafts with extra fields still save.
      const pick = <T extends object>(o: T, keys: string[]) =>
        Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => keys.includes(k) && v !== undefined && v !== null));
      await api('site-config/draft', {
        method: 'PATCH',
        body: {
          theme: pick(d.theme, ['colors', 'fonts', 'radius', 'buttonStyle', 'mode', 'logo', 'favicon', 'customCss']),
          layout: pick(d.layout, ['header', 'footer', 'productCard', 'home']),
          seo: pick(d.seo, ['title', 'description', 'ogImage']),
          settings: pick(d.settings, ['taxPercent', 'freeDeliveryAbove', 'phone', 'whatsapp', 'instagram', 'facebook', 'aboutText']),
        },
      });
      setSaveState('saved');
      setSaveError('');
    } catch (e) {
      setSaveState('error');
      setSaveError((e as Error).message);
    }
  }, []);

  /** Apply an edit: instant preview, undo history, debounced autosave. */
  const apply = useCallback((next: Draft, opts2: { history?: boolean } = {}) => {
    setDraft((prev) => {
      if (prev && opts2.history !== false) {
        const now = Date.now();
        if (now - lastPush.current > 600) setPast((p) => [...p.slice(-49), prev]);
        lastPush.current = now;
        setFuture([]);
      }
      return next;
    });
    post({ type: 'qs:config', config: next });
    setSaveState('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 700);
  }, [post, save]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saveState]);

  if (!draft || !opts) return <div className="content">Loading builder…</div>;

  const t = draft.theme;
  const colors = { primary: '#E31837', secondary: '#FFC72C', background: '#FFFFFF', surface: '#F7F7F8', text: '#1A1A1A', ...(t.colors ?? {}) };
  const setTheme = (patch: Partial<Draft['theme']>) => apply({ ...draft, theme: { ...t, ...patch } });
  const setLayout = (patch: Partial<Draft['layout']>) => apply({ ...draft, layout: { ...draft.layout, ...patch } });
  const home = draft.layout.home ?? [];
  const setHome = (h: Section[]) => setLayout({ home: h });
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([draft, ...future]);
    apply(prev, { history: false });
  };
  const redo = () => {
    const nxt = future[0];
    if (!nxt) return;
    setFuture(future.slice(1));
    setPast([...past, draft]);
    apply(nxt, { history: false });
  };
  const textOnBg = contrast(colors.text, colors.background);

  async function resetTemplate(key: string) {
    if (!confirmAction('Reset colours, fonts and sections to this template? Your menu and settings stay.')) return;
    try {
      const d = await api<Draft>('site-config/reset', { method: 'POST', body: { templateKey: key } });
      const next = { ...draft!, theme: d.theme, layout: d.layout };
      setPast((p) => [...p, draft!]);
      setDraft(next);
      post({ type: 'qs:config', config: next });
      setSelected(null);
      toast('Template applied');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function shareLink() {
    try {
      const { token: share } = await api<{ token: string }>('site-config/preview-token?share=1');
      const link = `${base}/preview?token=${share}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast('Preview link copied (valid 7 days)');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="builder">
      <div className="panel">
        <div className="tabs" role="tablist">
          {(['theme', 'sections', 'layout', 'info'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {k === 'theme' ? 'Style' : k === 'sections' ? 'Sections' : k === 'layout' ? 'Layout' : 'Info & SEO'}
            </button>
          ))}
        </div>
        <fieldset disabled={!writable} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          {tab === 'theme' && (
            <div className="pane stack">
              <div className="label">Quick presets</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {opts.presets.map((p) => (
                  <button key={p.key} className="choice" style={{ padding: 8 }} onClick={() => setTheme({ colors: p.colors })}>
                    <div className="swatches" style={{ marginTop: 0 }}>{['primary', 'secondary', 'background'].map((k) => <span key={k} style={{ background: p.colors[k] }} />)}</div>
                    <span className="small">{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="label">Colours</div>
              {Object.keys(COLOR_LABELS).map((k) => (
                <div key={k} className="color-row">
                  <input type="color" aria-label={COLOR_LABELS[k]} value={(colors as Record<string, string>)[k]} onChange={(e) => setTheme({ colors: { ...colors, [k]: e.target.value.toUpperCase() } })} />
                  <span style={{ flex: 1 }}>{COLOR_LABELS[k]}</span>
                  <input className="input" style={{ width: 100 }} aria-label={`${COLOR_LABELS[k]} hex`} value={(colors as Record<string, string>)[k]}
                    onChange={(e) => isHex(e.target.value) && setTheme({ colors: { ...colors, [k]: e.target.value.toUpperCase() } })} />
                </div>
              ))}
              {textOnBg < 4.5 && <div className="alert warn small">Text may be hard to read on this background (contrast {textOnBg.toFixed(1)}:1, aim for 4.5:1).</div>}
              <Field label="Fonts" htmlFor="fonts">
                <select id="fonts" className="select" value={`${t.fonts?.heading ?? 'Poppins'}|${t.fonts?.body ?? 'Inter'}`}
                  onChange={(e) => { const [heading, body] = e.target.value.split('|'); setTheme({ fonts: { heading, body } }); }}>
                  {opts.fonts.map((f) => <option key={f.key} value={`${f.heading}|${f.body}`}>{f.heading} + {f.body}</option>)}
                </select>
              </Field>
              <div className="grid grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Field label="Corners" htmlFor="radius">
                  <select id="radius" className="select" value={t.radius ?? 'md'} onChange={(e) => setTheme({ radius: e.target.value })}>
                    {['none', 'sm', 'md', 'lg', 'full'].map((r) => <option key={r} value={r}>{{ none: 'Square', sm: 'Slight', md: 'Rounded', lg: 'Very rounded', full: 'Soft' }[r]}</option>)}
                  </select>
                </Field>
                <Field label="Buttons" htmlFor="btn">
                  <select id="btn" className="select" value={t.buttonStyle ?? 'solid'} onChange={(e) => setTheme({ buttonStyle: e.target.value })}>
                    <option value="solid">Solid</option><option value="pill">Pill</option><option value="outline">Outline</option>
                  </select>
                </Field>
              </div>
              <Field label="Logo URL" htmlFor="logo" hint="PNG or SVG, transparent background works best.">
                <input id="logo" className="input" type="url" placeholder="https://…" value={t.logo ?? ''} onChange={(e) => setTheme({ logo: e.target.value })} />
              </Field>
              <Field label="Favicon URL" htmlFor="fav"><input id="fav" className="input" type="url" placeholder="https://…" value={t.favicon ?? ''} onChange={(e) => setTheme({ favicon: e.target.value })} /></Field>
              <details>
                <summary className="label" style={{ cursor: 'pointer' }}>Custom CSS (advanced)</summary>
                <textarea className="textarea" style={{ fontFamily: 'monospace', marginTop: 8 }} rows={6} value={t.customCss ?? ''} onChange={(e) => setTheme({ customCss: e.target.value })} />
              </details>
              <div className="label">Start over from a template</div>
              <select className="select" defaultValue="" aria-label="Reset to template" onChange={(e) => { if (e.target.value) resetTemplate(e.target.value); e.target.value = ''; }}>
                <option value="">Choose a template…</option>
                {opts.templates.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
              </select>
            </div>
          )}

          {tab === 'sections' && (
            <div className="pane stack">
              <p className="muted small" style={{ margin: 0 }}>Your home page, top to bottom. Click a section here or in the preview to edit it.</p>
              <div>
                {home.map((s, i) => (
                  <div key={i} className={`section-item${selected === i ? ' on' : ''}`} onClick={() => setSelected(i)}>
                    <span style={{ flex: 1 }}>{SECTION_NAMES[s.type] ?? s.type}</span>
                    <button className="btn btn-ghost btn-sm" aria-label="Move up" disabled={i === 0}
                      onClick={(e) => { e.stopPropagation(); const h = [...home]; [h[i - 1], h[i]] = [h[i], h[i - 1]]; setHome(h); setSelected(i - 1); }}>↑</button>
                    <button className="btn btn-ghost btn-sm" aria-label="Move down" disabled={i === home.length - 1}
                      onClick={(e) => { e.stopPropagation(); const h = [...home]; [h[i + 1], h[i]] = [h[i], h[i + 1]]; setHome(h); setSelected(i + 1); }}>↓</button>
                    <button className="btn btn-ghost btn-sm" aria-label="Remove section"
                      onClick={(e) => { e.stopPropagation(); setHome(home.filter((_, k) => k !== i)); setSelected(null); }}>✕</button>
                  </div>
                ))}
              </div>
              <select className="select" value="" aria-label="Add a section" onChange={(e) => {
                if (!e.target.value) return;
                setHome([...home, { type: e.target.value, props: {} }]);
                setSelected(home.length);
              }}>
                <option value="">+ Add a section…</option>
                {opts.sections.map((s) => <option key={s} value={s}>{SECTION_NAMES[s] ?? s}</option>)}
              </select>
              {selected !== null && home[selected] && (
                <div className="card stack" style={{ padding: 14 }}>
                  <strong>{SECTION_NAMES[home[selected].type]}</strong>
                  {(SECTION_FIELDS[home[selected].type] ?? []).map((f) => {
                    const val = home[selected].props?.[f.key];
                    const set = (v: string | number) => {
                      const h = [...home];
                      const props = { ...h[selected].props };
                      if (v === '' || (typeof v === 'number' && Number.isNaN(v))) delete props[f.key];
                      else props[f.key] = v;
                      h[selected] = { ...h[selected], props };
                      setHome(h);
                    };
                    const id = `sf-${f.key}`;
                    return (
                      <Field key={f.key} label={f.label} htmlFor={id}>
                        {f.kind === 'textarea' ? (
                          <textarea id={id} className="textarea" value={String(val ?? '')} onChange={(e) => set(e.target.value)} />
                        ) : f.kind === 'number' ? (
                          <input id={id} className="input" type="number" min={f.min} max={f.max} value={val === undefined ? '' : String(val)} onChange={(e) => set(e.target.value === '' ? '' : Math.min(f.max ?? 99, Math.max(f.min ?? 0, Number(e.target.value))))} />
                        ) : (
                          <input id={id} className="input" type={f.kind === 'url' ? 'url' : 'text'} value={String(val ?? '')} onChange={(e) => set(e.target.value)} />
                        )}
                      </Field>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'layout' && (
            <div className="pane stack">
              <Field label="Header style" htmlFor="hv">
                <select id="hv" className="select" value={draft.layout.header?.variant ?? 'left-logo'} onChange={(e) => setLayout({ header: { ...draft.layout.header, variant: e.target.value } })}>
                  <option value="left-logo">Logo on the left</option><option value="centered-logo">Logo in the centre</option>
                </select>
              </Field>
              <label className="checkbox"><input type="checkbox" checked={draft.layout.header?.sticky !== false} onChange={(e) => setLayout({ header: { ...draft.layout.header, sticky: e.target.checked } })} /> Keep header visible when scrolling</label>
              <Field label="Product cards" htmlFor="pc">
                <select id="pc" className="select" value={draft.layout.productCard?.imageRatio ?? 'square'} onChange={(e) => setLayout({ productCard: { ...draft.layout.productCard, imageRatio: e.target.value } })}>
                  <option value="square">Square photos</option><option value="landscape">Wide photos</option>
                </select>
              </Field>
              <label className="checkbox"><input type="checkbox" checked={draft.layout.productCard?.showDescription !== false} onChange={(e) => setLayout({ productCard: { ...draft.layout.productCard, showDescription: e.target.checked } })} /> Show item descriptions on cards</label>
              <Field label="Footer style" htmlFor="fv">
                <select id="fv" className="select" value={draft.layout.footer?.variant ?? 'simple'} onChange={(e) => setLayout({ footer: { ...draft.layout.footer, variant: e.target.value } })}>
                  <option value="simple">Full footer</option><option value="minimal">Minimal</option>
                </select>
              </Field>
              <Field label="Footer text" htmlFor="ft"><input id="ft" className="input" maxLength={300} value={draft.layout.footer?.text ?? ''} onChange={(e) => setLayout({ footer: { ...draft.layout.footer, text: e.target.value } })} /></Field>
            </div>
          )}

          {tab === 'info' && (
            <div className="pane stack">
              <Field label="Page title (Google)" htmlFor="st" hint={`${(draft.seo.title ?? '').length}/70`}>
                <input id="st" className="input" maxLength={70} value={draft.seo.title ?? ''} onChange={(e) => apply({ ...draft, seo: { ...draft.seo, title: e.target.value } })} />
              </Field>
              <Field label="Description (Google)" htmlFor="sd" hint={`${(draft.seo.description ?? '').length}/200`}>
                <textarea id="sd" className="textarea" maxLength={200} value={draft.seo.description ?? ''} onChange={(e) => apply({ ...draft, seo: { ...draft.seo, description: e.target.value } })} />
              </Field>
              <Field label="Share image URL" htmlFor="og"><input id="og" className="input" type="url" value={draft.seo.ogImage ?? ''} onChange={(e) => apply({ ...draft, seo: { ...draft.seo, ogImage: e.target.value } })} /></Field>
              {(['phone', 'whatsapp', 'instagram', 'facebook'] as const).map((k) => (
                <Field key={k} label={{ phone: 'Phone', whatsapp: 'WhatsApp number', instagram: 'Instagram URL', facebook: 'Facebook URL' }[k]} htmlFor={`s-${k}`}>
                  <input id={`s-${k}`} className="input" value={draft.settings[k] ?? ''} onChange={(e) => apply({ ...draft, settings: { ...draft.settings, [k]: e.target.value } })} />
                </Field>
              ))}
              <div className="grid grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Field label="Tax (GST %)" htmlFor="tax"><input id="tax" className="input" type="number" min={0} max={50} step={0.5} value={draft.settings.taxPercent ?? 0} onChange={(e) => apply({ ...draft, settings: { ...draft.settings, taxPercent: Number(e.target.value) || 0 } })} /></Field>
                <Field label="Free delivery above" htmlFor="fda" hint="0 = never"><input id="fda" className="input" type="number" min={0} value={draft.settings.freeDeliveryAbove ?? 0} onChange={(e) => apply({ ...draft, settings: { ...draft.settings, freeDeliveryAbove: Number(e.target.value) || 0 } })} /></Field>
              </div>
            </div>
          )}
        </fieldset>
      </div>

      <div className="stage">
        <div className="bar">
          <button className="btn btn-secondary btn-sm" onClick={undo} disabled={!past.length} aria-label="Undo">↶ Undo</button>
          <button className="btn btn-secondary btn-sm" onClick={redo} disabled={!future.length} aria-label="Redo">↷ Redo</button>
          <span className="small muted" role="status" style={{ marginLeft: 8 }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes' : saveState === 'error' ? '' : 'All changes saved to draft'}
          </span>
          {saveState === 'error' && <span className="pill danger" title={saveError}>Not saved: {saveError}</span>}
          <span className="spacer" />
          {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((d) => (
            <button key={d} className={`btn btn-sm ${device === d ? '' : 'btn-secondary'}`} onClick={() => setDevice(d)} aria-pressed={device === d}>
              {d === 'desktop' ? '🖥' : d === 'tablet' ? '📱 Tablet' : '📱'}<span className="sr-only">{d}</span>
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={shareLink}>Copy preview link</button>
          <a className="btn btn-sm" href="/publish">Publish →</a>
        </div>
        <div className="frame-wrap">
          {token && <iframe ref={frame} title="Live preview" src={`${base}/preview?token=${encodeURIComponent(token)}`} style={{ width: DEVICES[device] }} />}
        </div>
      </div>
    </div>
  );
}
