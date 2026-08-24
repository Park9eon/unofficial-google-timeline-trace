import type {Metadata} from 'next';
import {SerwistProvider} from '@serwist/next/react';
import {I18nProvider} from '@/i18n/I18nProvider';
import '@/video/video.css';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'Unofficial Google Timeline Trace',
  title: 'Unofficial Google Timeline Trace',
  description: 'Google timeline Film Studio',
  icons: {icon: [{url: '/icon.svg', type: 'image/svg+xml'}]},
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="ko">
      <body><SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === 'development'}><I18nProvider>{children}</I18nProvider></SerwistProvider></body>
    </html>
  );
}
