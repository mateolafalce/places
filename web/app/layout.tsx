import type { Metadata } from 'next';
import './globals.css';

const siteUrl = new URL('https://places.mateolafalce.chatgpt.site');
const socialImageUrl = new URL('/og.png', siteUrl).toString();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: 'Places',
  description:
    'A shared event floorplan where people pin what matters and an agent reflows everything else.',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/favicon.svg',
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
      <head>
        {/* The pixel faces are the whole look; fetch them with the document so
         * the chrome never paints a smooth fallback first. */}
        <link
          rel="preload"
          href="/fonts/press-start-2p-latin-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/pixelify-sans-latin-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
