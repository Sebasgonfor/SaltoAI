import Link from 'next/link';
import { SaltoLogo } from '@/components/ui/salto-logo';

export default function JovenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <header className="px-6 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between sticky top-0 z-20">
        <Link href="/" className="flex items-center gap-2.5 group">
          <SaltoLogo variant="light" size={32} />
          <div className="flex flex-col leading-tight">
            <span className="font-display font-semibold text-slate-900 tracking-tight">Salto</span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-emerald-600 font-medium">para jóvenes</span>
          </div>
        </Link>
        <nav className="flex gap-1 text-sm font-medium">
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
        </nav>
      </header>
      <main className="flex-1 flex flex-col w-full">
        {children}
      </main>
      <footer className="border-t border-slate-200 py-6 px-6 text-xs text-slate-500 flex justify-between max-w-7xl mx-auto w-full">
        <span>Salto · Tu primer salto al empleo formal</span>
        <span>Barranqui-IA 2026 · Macondo Lab · GOyn · ACOPI</span>
      </footer>
    </div>
  );
}
