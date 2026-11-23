'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function OpsLogin() {
  const router = useRouter();
  const [f, setF] = useState({ email: '', password: '', code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(body.message ?? 'Login failed');
    router.replace('/');
  }
  return (
    <main className="auth">
      <form className="card stack" onSubmit={submit}>
        <div className="brand">WebApp<span>Builder</span> Ops</div>
        <h1>Platform sign-in</h1>
        <p className="muted small" style={{ marginTop: 0 }}>Restricted to platform staff. All actions are audit-logged.</p>
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" required autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div className="field">
          <label htmlFor="code">2FA code</label>
          <input id="code" className="input" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="123456"
            value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} />
          <span className="hint">From your authenticator app.</span>
        </div>
        <button className="btn btn-lg btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
