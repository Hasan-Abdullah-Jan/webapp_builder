import Link from 'next/link';
import type { ReactNode } from 'react';
import { catalogPath, DEFAULT_VOCAB, type Menu, type Section, type StoreData } from '@/lib/types';
import { ProductCard } from './ProductCard';

/**
 * Section registry (plan §6.2). The home page is a list of `{ type, props }` from the tenant's
 * layout; each type maps to one component. Unknown types render nothing, so an old storefront
 * never breaks on a newer config. Used both for SSR pages and the live builder preview.
 */
type SectionProps = { props: Section['props']; data: StoreData; menu: Menu; index: number };

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

function Announcement({ props }: SectionProps) {
  const text = str(props.text);
  return text ? <div className="announcement">{text}</div> : null;
}

const vocabOf = (data: StoreData) => data.store.vocab ?? DEFAULT_VOCAB;

function HeroBanner({ props, data }: SectionProps) {
  const image = str(props.image);
  return (
    <section
      className={`hero${image ? ' has-image' : ''}`}
      style={image ? { backgroundImage: `url("${encodeURI(image)}")` } : undefined}
    >
      <div className="container inner">
        <h1>{str(props.title, 'Order online')}</h1>
        {str(props.subtitle) && <p>{str(props.subtitle)}</p>}
        <Link className="btn" href={catalogPath(vocabOf(data))}>{str(props.cta, vocabOf(data).cta)}</Link>
      </div>
    </section>
  );
}

function CategoryStrip({ props, menu, data }: SectionProps) {
  if (!menu.categories.length) return null;
  const base = catalogPath(vocabOf(data));
  const withImages = menu.categories.some((c) => c.image);
  return (
    <section className="section" style={{ paddingBottom: 0 }}>
      <div className="container">
        {str(props.title) && <h2 className="section-title">{str(props.title)}</h2>}
        {withImages ? (
          <nav className="cat-tiles" aria-label={vocabOf(data).categories}>
            {menu.categories.map((c) => (
              <Link key={c._id} href={`${base}#${c.slug}`} className="cat-tile">
                <span className="cat-img">{c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" loading="lazy" />
                ) : null}</span>
                <span>{c.name}</span>
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="cat-strip" aria-label={vocabOf(data).categories}>
            {menu.categories.map((c) => (
              <Link key={c._id} href={`${base}#${c.slug}`}>{c.name}</Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}

function FeaturedProducts({ props, menu }: SectionProps) {
  const tag = str(props.tag, 'popular');
  const items = menu.items.filter((i) => i.tags?.includes(tag)).slice(0, num(props.limit, 8));
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="container">
        <h2 className="section-title">{str(props.title, 'Popular')}</h2>
        <div className="grid cols-4">
          {items.map((i) => <ProductCard key={i._id} item={i} />)}
        </div>
      </div>
    </section>
  );
}

function MenuGrid({ props, menu, data }: SectionProps) {
  const cols = Math.min(Math.max(num(props.columns, 3), 1), 4);
  const byCat = menu.categories
    .map((c) => ({ c, items: menu.items.filter((i) => i.categoryId === c._id) }))
    .filter((x) => x.items.length);
  if (!byCat.length) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 className="section-title" style={{ margin: 0 }}>{str(props.title, vocabOf(data).catalog)}</h2>
          <span className="spacer" />
          <Link href={catalogPath(vocabOf(data))} className="btn btn-outline btn-sm">See all</Link>
        </div>
        {byCat.slice(0, num(props.categories, 3)).map(({ c, items }) => (
          <div key={c._id} style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 20 }}>{c.name}</h3>
            <div className={`grid cols-${cols}`}>
              {items.slice(0, cols * 2).map((i) => <ProductCard key={i._id} item={i} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function About({ props, data }: SectionProps) {
  return (
    <section className="section about">
      <div className="container inner">
        <h2 className="section-title">{str(props.title, `About ${data.store.name}`)}</h2>
        <p className="rich-text">{str(props.body, data.config.settings?.aboutText ?? '')}</p>
      </div>
    </section>
  );
}

function RichText({ props }: SectionProps) {
  return (
    <section className="section">
      <div className="container">
        {str(props.title) && <h2 className="section-title">{str(props.title)}</h2>}
        <p className="rich-text">{str(props.body)}</p>
      </div>
    </section>
  );
}

export function BranchList({ props, data }: Pick<SectionProps, 'props' | 'data'>) {
  if (!data.branches.length) return null;
  return (
    <section className="section">
      <div className="container">
        <h2 className="section-title">{str(props.title, 'Our branches')}</h2>
        <div className="branch-cards">
          {data.branches.map((b) => (
            <div key={b._id} className="branch-card">
              <h3 style={{ fontSize: 18 }}>{b.name}</h3>
              <p className="small" style={{ margin: '0 0 8px' }}>
                <span className={`status-dot${b.openNow ? '' : ' closed'}`} />
                {b.openNow ? 'Open now' : 'Closed now'}
              </p>
              {b.address && <p className="muted small" style={{ margin: 0 }}>{b.address}</p>}
              {b.phone && <p className="small" style={{ margin: '6px 0 0' }}><a href={`tel:${b.phone}`}>{b.phone}</a></p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const REGISTRY: Record<string, (p: SectionProps) => ReactNode> = {
  announcement: Announcement,
  heroBanner: HeroBanner,
  categoryStrip: CategoryStrip,
  featuredProducts: FeaturedProducts,
  menuGrid: MenuGrid,
  about: About,
  richText: RichText,
  branchList: BranchList,
};

export function Sections({ sections, data, menu, onSelect }: {
  sections: Section[];
  data: StoreData;
  menu: Menu;
  /** Builder preview: clicking a section selects it in the admin panel. */
  onSelect?: (index: number) => void;
}) {
  return (
    <>
      {sections.map((s, i) => {
        const C = REGISTRY[s.type];
        if (!C) return null;
        const node = <C props={s.props ?? {}} data={data} menu={menu} index={i} />;
        return onSelect ? (
          <div
            key={i}
            data-section={i}
            onClickCapture={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(i);
            }}
            style={{ cursor: 'pointer', outlineOffset: -2 }}
            className="preview-section"
          >
            {node}
          </div>
        ) : (
          <div key={i}>{node}</div>
        );
      })}
    </>
  );
}
