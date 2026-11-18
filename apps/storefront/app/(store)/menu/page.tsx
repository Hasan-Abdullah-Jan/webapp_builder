import type { Metadata } from 'next';
import { getMenu, getStore } from '@/lib/api';
import { MenuView } from '@/components/MenuView';

export const metadata: Metadata = { title: 'Menu' };

export default async function MenuPage() {
  const data = await getStore();
  if (!data) return null;
  const menu = await getMenu(data.branches[0]?._id);
  return <MenuView menu={menu} />;
}
