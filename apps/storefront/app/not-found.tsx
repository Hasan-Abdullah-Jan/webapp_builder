export default function NotFound() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100dvh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <p style={{ color: '#64748B', fontWeight: 700, margin: 0 }}>404</p>
        <h1 style={{ fontSize: 26 }}>Page not found</h1>
        <p style={{ color: '#64748B' }}>Check the link and try again.</p>
      </div>
    </main>
  );
}
