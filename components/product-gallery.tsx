'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ProductVariant } from '@/lib/domain';
import { galleryForFinish } from '@/lib/product-gallery';
import { ProductImage } from './product-image';

export function ProductGallery({
  images,
  name,
  productId,
  variants = [],
}: {
  images: string[];
  name: string;
  productId: string;
  variants?: ProductVariant[];
}) {
  const [selected, setSelected] = useState(0);
  const [variantId, setVariantId] = useState('');
  const displayedImages = useMemo(
    () =>
      galleryForFinish(
        images,
        variants.find((item) => item.id === variantId),
      ),
    [images, variants, variantId],
  );
  useEffect(() => {
    const onFinish = (event: Event) => {
      const detail = (
        event as CustomEvent<{ productId: string; variantId: string }>
      ).detail;
      if (detail?.productId !== productId) return;
      setVariantId(detail.variantId);
      setSelected(0);
    };
    window.addEventListener('wow:finish-selected', onFinish);
    return () => window.removeEventListener('wow:finish-selected', onFinish);
  }, [productId]);
  return (
    <div
      className="gallery ux-product-gallery"
      data-finish-gallery={variantId || undefined}
    >
      <ProductImage
        src={displayedImages[selected] || displayedImages[0]}
        alt={selected ? `${name} detail view ${selected}` : name}
        eager
      />
      {displayedImages.length > 1 && (
        <div
          className="ux-gallery-choices"
          role="group"
          aria-label="Product photos"
        >
          {displayedImages.map((src, index) => (
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
