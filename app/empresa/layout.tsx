import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { RoleGate } from '@/components/auth/role-gate';

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between sticky top-0 z-20">
        <Link href="/" className="flex items-center gap-2.5">
          <SaltoLogo variant="light" size={32} />
          <div className="flex flex-col leading-tight">
            <span className="font-display font-semibold text-slate-900 tracking-tight">Salto</span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-medium">para empresas</span>
          </div>
        </Link>
        <nav className="flex gap-1 items-center text-sm font-medium">
          <Link
            href="/empresa/publicar"
            className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Publicar necesidad
          </Link>
          <Link
            href="/empresa/matches"
            className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Mis matches
          </Link>
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
