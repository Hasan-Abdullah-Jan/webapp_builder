'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { ErrorBox, Field, useToast } from '@/components/ui';

const TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'America/New_York', 'UTC'];

export default function SettingsPage() {
  const { me, reload } = useMe();
  const toast = useToast();
  const [f, setF] = useState({ name: me.tenant.name, timezone: me.tenant.timezone, currency: me.tenant.currency });
  const [error, setError] = useState('');
  async function save() {
    try {
      await api('store', { method: 'PATCH', body: f });
      await reload();
      setError('');
      toast('Settings saved');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="content" style={{ maxWidth: 720 }}>
      <div className="page-head"><h1>Store settings</h1></div>
      <div className="card stack">
        <ErrorBox error={error} />
        <Field label="Business name" htmlFor="n"><input id="n" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-2">
          <Field label="Timezone" htmlFor="tz" hint="Used for opening hours and reports.">
            <select id="tz" className="select" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
              {[...new Set([f.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Currency" htmlFor="cur">
            <select id="cur" className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {['PKR', 'AED', 'SAR', 'GBP', 'USD'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Website address" htmlFor="slug" hint="Contact support to change your address or connect your own domain.">
          <input id="slug" className="input" disabled value={`${me.tenant.slug}.quickstore.pk`} />
        </Field>
        <div className="row"><span className="spacer" /><button className="btn" onClick={save}>Save settings</button></div>
      </div>
      <div className="card">
        <h2>Contact details, tax and social links</h2>
        <p className="muted" style={{ margin: 0 }}>These appear on your website. Edit them in <a href="/design">Website design → Info &amp; SEO</a>.</p>
      </div>
    </div>
  );
}
