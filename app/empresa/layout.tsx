import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 h-14 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 bg-white">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-900 rounded flex items-center justify-center text-white font-bold font-display">S</div>
            <span className="font-display font-medium text-slate-900">Salto Empresas</span>
          </Link>
        </div>
        <div className="flex gap-4 text-sm font-medium items-center">
          <Link href="/empresa/publicar" className="text-slate-600 hover:text-slate-900">Publicar Necesidad</Link>
          <Link href="/empresa/matches" className="text-slate-900 hover:text-emerald-700">Mis Matches</Link>
          <Button variant="outline" size="sm" className="hidden md:inline-flex">Ayuda</Button>
        </div>
      </header>
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
