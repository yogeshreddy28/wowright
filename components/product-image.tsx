import { ImageIcon } from 'lucide-react';
export function ProductImage({
  src,
  alt,
  className = '',
  eager = false,
}: {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  if (src)
    return (
      <img
        className={`product-image ${className}`}
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
      />
    );
  return (
    <div
      className={`image-placeholder ${className}`}
      role="img"
      aria-label={`${alt} image coming soon`}
    >
      <div>
        <ImageIcon />
        <span>New product visual</span>
        <small>Photography being prepared</small>
      </div>
    </div>
  );
}
