import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { SALTO_FAVICON } from '@/components/ui/salto-logo';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'SaltoAI - Tu primer empleo por potencial, no por CV',
  description: 'Conecta talento junior sin experiencia formal con startups y mipymes mediante matching de potencial impulsado por IA.',
  icons: {
    icon: SALTO_FAVICON,
    apple: SALTO_FAVICON,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans bg-[#F9FAFB] text-slate-900 antialiased min-h-screen" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
