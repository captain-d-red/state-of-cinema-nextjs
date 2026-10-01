import type { Metadata, Viewport } from 'next';
import { uiFont } from '@/lib/fonts';
import './globals.css';

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'AK47 · The State of Cinema',
  description: 'Seventy-two films from 2010 to 2025 in numbers and picks, told as one flight over a valley of light.',
  openGraph: {
    title: 'AK47 · The State of Cinema',
    description: 'Seventy-two films in numbers and picks, told as one flight over a valley of light.',
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
