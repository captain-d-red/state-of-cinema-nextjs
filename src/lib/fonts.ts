import localFont from 'next/font/local';

/** The interface face, an Inter-derived subset under the SIL Open Font License. */
export const uiFont = localFont({
  src: '../app/fonts/ui.woff2',
  variable: '--font-ui',
  weight: '100 900',
  display: 'swap',
});
