import Link from 'next/link';
import { storeBase } from '@/lib/api';

export default async function StoreNotFound() {
  const base = await storeBase();
  return (
    <div className="state-page">
      <div>
        <p className="muted" style={{ fontWeight: 700, margin: 0 }}>404</p>
        <h1>We couldn&apos;t find that page</h1>
        <p className="muted">It may have been removed or the link is wrong.</p>
        <Link className="btn" href={base || '/'}>Back to the store</Link>
      </div>
    </div>
  );
}
