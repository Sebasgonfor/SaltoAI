import Link from 'next/link';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { RoleGate } from '@/components/auth/role-gate';

export default function JovenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <header className="px-6 h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between sticky top-0 z-20">
        <Link href="/" className="flex items-center shrink-0 group">
          <SaltoLogo variant="full" size={56} />
        </Link>
        <nav className="flex gap-1 items-center text-sm font-medium">
          <Link
            href="/joven/chat"
            className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Entrevista
          </Link>
          <Link
            href="/joven/perfil"
            className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Mi Perfil
          </Link>
          <Link
            href="/joven/conectar"
            className="px-3 py-1.5 rounded-md text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 transition-colors"
          >
            Empresas
          </Link>
          <Link
            href="/joven/tareas"
            className="px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Mis Tareas
          </Link>
          <div className="h-5 w-px bg-slate-200 mx-2" />
          <UserButton />
        </nav>
      </header>
      <main className="flex-1 flex flex-col w-full">
        <RoleGate role="joven">{children}</RoleGate>
      </main>
      <footer className="border-t border-slate-200 py-6 px-6 text-xs text-slate-500 flex justify-between max-w-7xl mx-auto w-full">
        <span>Salto · Tu primer salto al empleo formal</span>
        <span>Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI</span>
      </footer>
    </div>
  );
}
