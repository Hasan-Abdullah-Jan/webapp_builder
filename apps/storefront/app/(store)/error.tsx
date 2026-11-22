'use client';

import { useEffect } from 'react';

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="state-page">
      <div>
        <h1>Something went wrong</h1>
        <p className="muted">Please try again. Your cart is saved.</p>
        <button className="btn" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
