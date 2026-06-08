'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useJovenProfileId } from '@/lib/hooks/use-joven-profile-id';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { AppFooter } from '@/components/layout/app-footer';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { JovenSidebar } from './joven-sidebar';
import { JovenBottomNav } from './joven-bottom-nav';
import type { JovenNavItem } from './joven-nav-items';

const FOOTER_LEFT = 'SaltoAI · Tu primer salto al empleo formal';
const FOOTER_RIGHT = 'Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI';

/**
 * App-shell del joven: sidebar en escritorio + barra inferior en móvil.
 *
 * Es ROL-AWARE: solo el joven ve su navegación de app. Una empresa o un
 * visitante anónimo (que puede abrir el perfil público /joven/perfil/[id])
 * recibe un chrome mínimo, sin imponerle la nav del joven.
 */
export function JovenAppShell({ children }: { children: React.ReactNode }) {
  const { account, loading, roleLoading } = useAuth();
  const jovenProfileId = useJovenProfileId();

  const resolveHref = (item: JovenNavItem): string =>
    item.key === 'perfil' && jovenProfileId ? `/joven/perfil/${jovenProfileId}` : item.href;

  if (loading || roleLoading) {
    return <LoadingSpinner variant="full" />;
  }

  // Chrome mínimo para viewers que NO son el joven (empresa/anónimo en el
  // perfil público). Sin sidebar/bottom-nav del joven.
  if (account?.role !== 'joven') {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex flex-col overflow-x-hidden">
        <header className="sticky top-0 z-40 h-14 px-4 sm:px-6 flex items-center justify-between border-b border-slate-200/70 bg-[#FAFAF7]/90 backdrop-blur-md">
          <Link href="/" className="flex items-center" aria-label="Inicio">
            <SaltoLogo variant="full" size={48} />
          </Link>
          <UserButton />
        </header>
        <main className="flex-1 flex flex-col w-full min-w-0">{children}</main>
        <AppFooter left={FOOTER_LEFT} right={FOOTER_RIGHT} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] overflow-x-hidden">
      <JovenSidebar resolveHref={resolveHref} />

      {/* Top-bar móvil: logo + cuenta (la nav vive en la barra inferior). */}
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 flex items-center justify-between border-b border-slate-200/70 bg-[#FAFAF7]/90 backdrop-blur-md">
        <Link href="/dashboard" className="flex items-center" aria-label="Inicio">
          <SaltoLogo variant="full" size={44} />
        </Link>
        <UserButton />
      </header>

      <div className="md:pl-60 flex min-h-screen flex-col">
        <main className="flex-1 flex flex-col w-full min-w-0 pb-20 md:pb-0">{children}</main>
        <AppFooter left={FOOTER_LEFT} right={FOOTER_RIGHT} />
      </div>

      <JovenBottomNav resolveHref={resolveHref} />
    </div>
  );
}

export default JovenAppShell;
