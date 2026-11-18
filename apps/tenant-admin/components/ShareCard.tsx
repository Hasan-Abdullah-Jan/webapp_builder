'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, MessageCircle } from 'lucide-react';
import { storeUrl } from '@/lib/client';
import { useMe } from './Shell';
import { useToast } from './ui';

/** Live URL with copy, WhatsApp share and a downloadable QR code (plan §5 step 8). */
export function ShareCard() {
  const { me } = useMe();
  const toast = useToast();
  const url = storeUrl(me.tenant.slug);
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0F172A', light: '#FFFFFF' } }).then(setQr).catch(() => {});
  }, [url]);
  const share = `Shop online at ${me.tenant.name}: ${url}`;
  return (
    <div className="card">
      <div className="card-head"><h2>Share your store</h2></div>
      <div className="row nowrap" style={{ alignItems: 'flex-start', gap: 16 }}>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR code for ${url}`} width={112} height={112} style={{ borderRadius: 10, border: '1px solid var(--border)' }} />
        )}
        <div className="stack-sm" style={{ minWidth: 0, flex: 1 }}>
          <a href={url} target="_blank" rel="noreferrer" className="strong" style={{ wordBreak: 'break-all' }}>{url.replace(/^https?:\/\//, '')}</a>
          <p className="small muted mb-0">Print the QR code on menus, flyers and packaging.</p>
          <div className="row">
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copied'))}><Copy size={14} /> Copy link</button>
            <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
            {qr && <a className="btn btn-secondary btn-sm" href={qr} download={`${me.tenant.slug}-qr.png`}><Download size={14} /> QR</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
