import Link from 'next/link';
import { catalogPath, DEFAULT_VOCAB, type StoreData } from '@/lib/types';

export function Footer({ data }: { data: StoreData }) {
  const s = data.config.settings ?? {};
  const f = data.config.layout.footer ?? {};
  const year = new Date().getFullYear();
  if (f.variant === 'minimal') {
    return (
      <footer className="site-footer">
        <div className="container row">
          <span>© {year} {data.store.name}</span>
          <span className="spacer" />
          <span className="powered">Powered by QuickStore</span>
        </div>
      </footer>
    );
  }
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="cols">
          <div>
            <h4>{data.store.name}</h4>
            {f.text && <p className="muted" style={{ margin: 0 }}>{f.text}</p>}
          </div>
          <div>
            <h4>Browse</h4>
            <p style={{ margin: 0 }}><Link href={(data.base ?? '') + catalogPath(data.store.vocab ?? DEFAULT_VOCAB)}>{(data.store.vocab ?? DEFAULT_VOCAB).catalog}</Link></p>
            <p style={{ margin: '4px 0 0' }}><Link href={`${data.base ?? ''}/checkout`}>Checkout</Link></p>
          </div>
          {(s.phone || s.whatsapp || s.instagram || s.facebook) && (
            <div>
              <h4>Contact</h4>
              {s.phone && <p style={{ margin: 0 }}><a href={`tel:${s.phone}`}>{s.phone}</a></p>}
              {s.whatsapp && (
                <p style={{ margin: '4px 0 0' }}>
                  <a href={`https://wa.me/${s.whatsapp.replace(/[^0-9]/g, '')}`} rel="noopener noreferrer" target="_blank">WhatsApp</a>
                </p>
              )}
              {s.instagram && <p style={{ margin: '4px 0 0' }}><a href={s.instagram} rel="noopener noreferrer" target="_blank">Instagram</a></p>}
              {s.facebook && <p style={{ margin: '4px 0 0' }}><a href={s.facebook} rel="noopener noreferrer" target="_blank">Facebook</a></p>}
            </div>
          )}
          {data.branches.length > 0 && (
            <div>
              <h4>{data.branches.length > 1 ? 'Branches' : 'Find us'}</h4>
              {data.branches.slice(0, 4).map((b) => (
                <p key={b._id} style={{ margin: '0 0 4px' }}>{b.name}{b.address ? ` — ${b.address}` : ''}</p>
              ))}
            </div>
          )}
        </div>
        <div className="powered">© {year} {data.store.name} · Powered by QuickStore</div>
      </div>
    </footer>
  );
}
