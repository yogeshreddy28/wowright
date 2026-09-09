import Link from 'next/link';

export function BrandLogo({
  inverted = false,
  href = '/',
}: {
  inverted?: boolean;
  href?: string;
}) {
  return (
    <Link
      className={`brand-logo${inverted ? ' inverted' : ''}`}
      href={href}
      aria-label="WOW RIGHT home"
    >
      <span>WOW</span>
      <b>RIGHT</b>
    </Link>
  );
}
