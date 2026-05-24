import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { NavLink } from '@/components/nav-link';
import { RoleGate } from '@/components/auth/role-gate';

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 h-20 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between sticky top-0 z-20">
        <Link href="/" className="flex items-center shrink-0">
          <SaltoLogo variant="full" size={56} />
        </Link>
        <nav className="flex gap-1 items-center text-sm font-medium">
          {/* matchPrefix=false en "Inicio" porque /empresa es prefijo de TODO el
              árbol — si fuera true, "Inicio" quedaría activo en cualquier ruta
              /empresa/*. Acá queremos match exacto. */}
          <NavLink
            href="/empresa"
            label="Inicio"
            matchPrefix={false}
            hint="Tu dashboard: necesidades publicadas, micro-tareas activas y métricas."
          />
          <NavLink
            href="/empresa/chat"
            label="Publicar necesidad"
            hint="Conversá con la IA para describir el rol — extrae skills, contexto y restricciones."
          />
          <NavLink
            href="/empresa/matches"
            label="Mis matches"
            hint="Shortlist de candidatos rankeados por ICS para cada necesidad publicada."
          />
          <Button variant="outline" size="sm" className="hidden md:inline-flex ml-2">
            Ayuda
          </Button>
          <div className="h-5 w-px bg-slate-200 mx-2" />
          <UserButton />
        </nav>
      </header>
      <main className="flex-1 flex flex-col w-full">
        <RoleGate role="empresa">{children}</RoleGate>
      </main>
      <footer className="border-t border-slate-200 py-6 px-6 text-xs text-slate-500 flex justify-between max-w-7xl mx-auto w-full">
        <span>Salto · Calidad, no volumen</span>
        <span>Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI</span>
      </footer>
    </div>
  );
}
