import type { Metadata } from 'next';
import { DM_Sans, Lora } from 'next/font/google';
import './globals.css';
import { StoreProvider } from '@/components/store-provider';

const sans = DM_Sans({ variable: '--font-sans', subsets: ['latin'] });
const serif = Lora({ variable: '--font-serif', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  title: { default: 'MorrowMade — Ideas, Made Real.', template: '%s · MorrowMade' },
  description: 'Personalized 3D printed products designed and made for you in Bangalore.',
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: 'en_IN', siteName: 'MorrowMade', title: 'Ideas, Made Real.', description: 'Personalized 3D printed products designed and made for you.' },
  twitter: { card: 'summary', title: 'MorrowMade — Ideas, Made Real.', description: 'Personalized 3D printed products designed and made for you.' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organization={"@context":"https://schema.org","@type":"Organization",name:'MorrowMade',url:process.env.SITE_URL||'http://localhost:3000',address:{"@type":"PostalAddress",addressLocality:'Bangalore',addressCountry:'IN'},contactPoint:{"@type":"ContactPoint",telephone:'+91-93531-93080',contactType:'customer service'}};
  return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(organization)}}/><StoreProvider>{children}</StoreProvider></body></html>;
}
