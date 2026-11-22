'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/** Recovery screen for unexpected errors inside the admin (never a blank page). */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="content">
      <div className="card empty">
        <div className="empty-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><AlertTriangle size={22} /></div>
        <h3>Something went wrong on this page</h3>
        <p style={{ maxWidth: 420, margin: '0 auto 14px' }}>Your data is safe. Try again, and if it keeps happening, reload the page.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={reset}><RotateCcw size={15} /> Try again</button>
          <a className="btn btn-secondary" href="/">Go to Home</a>
        </div>
        {error.digest && <p className="small faint" style={{ marginTop: 12 }}>Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
