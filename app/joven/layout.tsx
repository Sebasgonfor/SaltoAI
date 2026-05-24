import Link from 'next/link';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { JovenNav } from '@/components/joven-nav';

/**
 * El layout NO aplica RoleGate global. Cada page decide:
 *  - /joven/chat, /joven/tareas/*, /joven/conectar → wrappean con RoleGate role="joven".
 *  - /joven/perfil/[id] → PÚBLICO (las empresas necesitan ver el perfil del
 *    candidato sin tener que loguearse como joven). El page muestra un
 *    banner contextual cuando el viewer está logueado como empresa.
 *  - /joven/perfil (landing sin id) → también público.
 *
 * Esto desbloquea el flujo central: founder en /empresa/matches/{needId}
 * → click en card de candidato → /joven/perfil/{profileId} → puede ver al
 * candidato. Antes esto chocaba contra el muro de RoleGate.
 */
export default function JovenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <header className="px-6 h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between sticky top-0 z-20">
        <Link href="/" className="flex items-center shrink-0 group">
          <SaltoLogo variant="full" size={56} />
        </Link>
        <JovenNav />
      </header>
      <main className="flex-1 flex flex-col w-full">{children}</main>
      <footer className="border-t border-slate-200 py-6 px-6 text-xs text-slate-500 flex justify-between max-w-7xl mx-auto w-full">
        <span>Salto · Tu primer salto al empleo formal</span>
        <span>Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI</span>
      </footer>
    </div>
  );
}
