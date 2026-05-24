import Link from 'next/link';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { NavLink } from '@/components/nav-link';
import { RoleGate } from '@/components/auth/role-gate';

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-4 sm:px-6 h-20 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between sticky top-0 z-20">
        <Link href="/" className="flex items-center shrink-0">
          <SaltoLogo variant="full" size={56} />
        </Link>
        <nav className="flex gap-1 items-center text-sm font-medium">
          {/* matchPrefix=false en "Inicio" porque /empresa es prefijo de TODO el
              árbol — si fuera true, "Inicio" quedaría activo en cualquier ruta
              /empresa/*. Aquí queremos match exacto. */}
          <NavLink
            href="/empresa"
            label="Inicio"
            matchPrefix={false}
            hint="Tu dashboard: necesidades publicadas, micro-tareas activas y métricas."
          />
          <NavLink
            href="/empresa/chat"
            label="Publicar necesidad"
            hint="Conversa con la IA para describir el rol — extrae skills, contexto y restricciones."
          />
          <NavLink
            href="/empresa/matches"
            label="Mis matches"
            hint="Shortlist de candidatos rankeados por ICS para cada necesidad publicada."
          />
          {/* Botón "Ayuda" removido por petición del user — el separador
              también queda fuera porque sin nada a la izquierda no tiene
              sentido visual. UserButton hereda el spacing del flex. */}
          <UserButton />
        </nav>
      </header>
      <main className="flex-1 flex flex-col w-full">
        <RoleGate role="empresa">{children}</RoleGate>
      </main>
      <footer className="border-t border-slate-200 py-6 px-4 sm:px-6 text-xs text-slate-500 flex justify-between max-w-7xl mx-auto w-full">
        <span>SaltoAI · Calidad, no volumen</span>
        <span>Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI</span>
      </footer>
    </div>
  );
}
