'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { AppFooter } from '@/components/layout/app-footer';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { RoleGate } from '@/components/auth/role-gate';
import { EmpresaSidebar } from './empresa-sidebar';
import { EmpresaBottomNav } from './empresa-bottom-nav';

const FOOTER_LEFT = 'SaltoAI · Calidad, no volumen';
const FOOTER_RIGHT = 'Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI';

/**
 * App-shell de la empresa: sidebar en escritorio + barra inferior en móvil.
 * Mismo patrón que el del joven (JovenAppShell). Es ROL-AWARE: solo la empresa
 * ve su navegación; un viewer de otro rol recibe chrome mínimo y el RoleGate
 * lo redirige. El RoleGate envuelve el contenido para conservar la protección
 * que antes vivía en el layout.
 */
export function EmpresaAppShell({ children }: { children: React.ReactNode }) {
  const { account, loading, roleLoading } = useAuth();

  if (loading || roleLoading) {
    return <LoadingSpinner variant="full" />;
  }

  // Chrome mínimo para viewers que NO son empresa: sin sidebar/bottom-nav.
  // El RoleGate se encarga de redirigir a su zona.
  if (account?.role !== 'empresa') {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex flex-col overflow-x-hidden">
        <header className="sticky top-0 z-40 h-14 px-4 sm:px-6 flex items-center justify-between border-b border-slate-200/70 bg-[#FAFAF7]/90 backdrop-blur-md">
          <Link href="/" className="flex items-center" aria-label="Inicio">
            <SaltoLogo variant="full" size={48} />
          </Link>
          <UserButton />
        </header>
        <main className="flex-1 flex flex-col w-full min-w-0">
          <RoleGate role="empresa">{children}</RoleGate>
        </main>
        <AppFooter left={FOOTER_LEFT} right={FOOTER_RIGHT} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] overflow-x-hidden">
      <EmpresaSidebar />

      {/* Top-bar móvil: logo + cuenta (la nav vive en la barra inferior). */}
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 flex items-center justify-between border-b border-slate-200/70 bg-[#FAFAF7]/90 backdrop-blur-md">
        <Link href="/empresa" className="flex items-center" aria-label="Inicio">
          <SaltoLogo variant="full" size={44} />
        </Link>
        <UserButton />
      </header>

      <div className="md:pl-60 flex min-h-screen flex-col">
        <main className="flex-1 flex flex-col w-full min-w-0 pb-20 md:pb-0">
          <RoleGate role="empresa">{children}</RoleGate>
        </main>
        <AppFooter left={FOOTER_LEFT} right={FOOTER_RIGHT} />
      </div>

      <EmpresaBottomNav />
    </div>
  );
}

export default EmpresaAppShell;
