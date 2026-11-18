'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authCall } from '@/lib/client';
import { Store } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ store: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authCall('login', { ...form, store: form.store.trim().toLowerCase().replace(/\..*$/, '') });
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form className="card stack" onSubmit={submit}>
        <div className="brand"><span className="logo-mark"><Store size={16} /></span> QuickStore</div>
        <h1>Welcome back</h1>
        <p className="muted" style={{ marginTop: -4 }}>Log in to manage your store.</p>
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="store">Website address</label>
          <div className="input-group">
            <input id="store" className="input" required autoComplete="organization" placeholder="pizzapoint" value={form.store}
              onChange={(e) => setForm({ ...form, store: e.target.value })} />
            <span className="addon">.quickstore.pk</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button className="btn btn-lg btn-block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="muted small" style={{ textAlign: 'center' }}>
          New here? <Link href="/signup">Create your store in minutes</Link>
        </p>
      </form>
    </main>
  );
}
