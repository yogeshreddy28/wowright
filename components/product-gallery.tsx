'use client';
import { useState } from 'react';
import { ProductImage } from './product-image';

export function ProductGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const [selected, setSelected] = useState(0);
  return (
    <div className="gallery ux-product-gallery">
      <ProductImage
        src={images[selected] || images[0]}
        alt={selected ? `${name} detail view ${selected}` : name}
        eager
      />
      {images.length > 1 && (
        <div
          className="ux-gallery-choices"
          role="group"
          aria-label="Product photos"
        >
          {images.map((src, index) => (
            <button
              key={`${src}-${index}`}
              type="button"
              aria-label={`View product photo ${index + 1}`}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              <ProductImage src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
