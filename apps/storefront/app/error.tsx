'use client';

/** Shown when a store page can't load at all, e.g. the API is down or API_URL isn't set. */
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100dvh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>This store can&apos;t load right now</h1>
        <p style={{ color: '#64748B', maxWidth: 420 }}>
          The store&apos;s server isn&apos;t responding. If you run this site, check that the API is running and that API_URL is set.
        </p>
        <button onClick={reset} style={{ padding: '10px 18px', borderRadius: 8, border: 0, background: '#111827', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          Try again
        </button>
      </div>
    </main>
  );
}
