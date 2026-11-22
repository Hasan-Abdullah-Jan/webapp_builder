'use client';

/** Last-resort error screen (when the root layout itself fails). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: '#64748B' }}>Please try again.</p>
          <button onClick={reset} style={{ padding: '10px 18px', borderRadius: 8, border: 0, background: '#4F46E5', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
