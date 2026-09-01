import type { Metadata } from 'next';
import './globals.css';

const siteUrl = new URL('https://places.mateolafalce.chatgpt.site');
const socialImageUrl = new URL('/og.png', siteUrl).toString();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: 'Places — Orchard House Saturday',
  description:
    'A shared event floorplan where people pin what matters and an agent reflows everything else.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Places',
    description: 'Pin what matters. The agent reflows the rest.',
    type: 'website',
    url: '/',
    images: [
      {
        url: socialImageUrl,
        width: 1200,
        height: 630,
        alt: 'Places — Pin what matters. The agent reflows the rest.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Places',
    description: 'Pin what matters. The agent reflows the rest.',
    images: [socialImageUrl],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
