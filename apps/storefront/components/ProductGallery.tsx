'use client';

import { useState } from 'react';
import { initials } from '@/lib/format';

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  return (
    <div className="gallery">
      <div className="gallery-main">
        {images[i] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[i]} alt={name} />
        ) : <div className="placeholder" aria-hidden>{initials(name)}</div>}
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.map((src, k) => (
            <button key={src} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Image ${k + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
