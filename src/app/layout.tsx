import type { Metadata, Viewport } from 'next';
import { uiFont } from '@/lib/fonts';
import './globals.css';

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'AK47 · The State of Experiences',
  description:
    'A first look at everything we stream, live channels, sport, news and the best films, told as one flight down a river of light.',
  openGraph: {
    title: 'AK47 · The State of Experiences',
    description:
      'Live channels, sport, news and the best films, picked for you, told as one flight down a river of light.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#08090d',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={uiFont.variable}>
      <body>{children}</body>
    </html>
  );
}
