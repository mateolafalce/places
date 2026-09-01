import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Places — Orchard House Saturday',
  description:
    'A shared event floorplan where people pin what matters and an agent reflows everything else.',
  openGraph: {
    title: 'Places',
    description: 'Pin what matters. The agent reflows the rest.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Places',
    description: 'Pin what matters. The agent reflows the rest.',
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
