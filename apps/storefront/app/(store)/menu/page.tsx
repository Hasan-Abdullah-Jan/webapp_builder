import type { Metadata } from 'next';
import { getMenu, getStore } from '@/lib/api';
import { Suspense } from 'react';
import { MenuView } from '@/components/MenuView';

export async function generateMetadata(): Promise<Metadata> {
  const data = await getStore();
  return { title: data?.store.vocab?.catalog ?? 'Shop' };
}

export default async function MenuPage() {
  const data = await getStore();
  if (!data) return null;
  const menu = await getMenu(data.branches[0]?._id);
  return <Suspense><MenuView menu={menu} /></Suspense>;
}
