import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Yacht PMS',
  description: 'Operación diaria privada de yates',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
