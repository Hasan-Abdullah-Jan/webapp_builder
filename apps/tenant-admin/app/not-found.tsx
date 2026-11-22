import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="auth">
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="muted" style={{ fontWeight: 600, margin: 0 }}>404</p>
        <h1>Page not found</h1>
        <p className="muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <Link className="btn" href="/">Back to your dashboard</Link>
      </div>
    </main>
  );
}
