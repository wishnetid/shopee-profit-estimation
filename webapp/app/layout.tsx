import type { Metadata } from 'next';
import './globals.css';
import AppFrame from '@/components/AppFrame';

export const metadata: Metadata = {
  title: 'Shopee Profit Estimation',
  description: 'Dashboard untuk estimasi profit Shopee',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
