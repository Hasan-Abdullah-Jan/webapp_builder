import type { Metadata } from 'next';
import { TrackView } from '@/components/TrackView';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { id } = await params;
  const { c } = await searchParams;
  return <TrackView orderId={id} code={c ?? ''} />;
}
