import { getMenu, getStore } from '@/lib/api';
import { Sections } from '@/components/Sections';

export default async function Home() {
  const data = await getStore();
  if (!data) return null;
  const menu = await getMenu(data.branches[0]?._id);
  const sections = data.config.layout.home ?? [];
  return <Sections sections={sections} data={data} menu={menu} />;
}
