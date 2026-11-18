import type { Metadata } from 'next';
import { PreviewApp } from '@/components/PreviewApp';

export const metadata: Metadata = { title: 'Preview', robots: { index: false, follow: false } };

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return <main className="empty" style={{ fontFamily: 'system-ui, sans-serif' }}>Missing preview token.</main>;
  }
  return <PreviewApp token={token} />;
}
