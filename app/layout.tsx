import type { Metadata } from 'next';
import { DM_Sans, Lora } from 'next/font/google';
import './globals.css';
import { StoreProvider } from '@/components/store-provider';
import { AnalyticsProvider } from '@/components/analytics-provider';

const sans = DM_Sans({ variable: '--font-sans', subsets: ['latin'] });
const serif = Lora({ variable: '--font-serif', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'WOW RIGHT — Ideas, Made Real.',
    template: '%s · WOW RIGHT',
  },
  description:
    'Personalized 3D printed products made to turn your ideas, memories and imagination into something you can hold.',
  icons: { icon: '/favicon.svg' },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'WOW RIGHT',
    title: 'WOW RIGHT — Ideas, Made Real.',
    description: 'Personalized 3D printed products made around you.',
    images: ['/demo-products/hero-studio.webp'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WOW RIGHT — Ideas, Made Real.',
    description: 'Personalized 3D printed products made around you.',
    images: ['/demo-products/hero-studio.webp'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'WOW RIGHT',
    url: process.env.SITE_URL || 'http://localhost:3000',
    logo: `${process.env.SITE_URL || 'http://localhost:3000'}/demo-products/hero-studio.webp`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Bangalore',
      addressCountry: 'IN',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+91-93531-93080',
      contactType: 'customer service',
    },
  };
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
        />
        <StoreProvider>
          {children}
          <AnalyticsProvider />
        </StoreProvider>
      </body>
    </html>
  );
}
