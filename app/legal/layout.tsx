import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SaltoLogo } from '@/components/ui/salto-logo';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            <span className="hidden sm:inline font-medium">Volver a Salto</span>
          </Link>

          <Link href="/" className="flex items-center gap-2">
            <SaltoLogo size={26} />
            <span className="font-display font-bold text-slate-900 text-sm tracking-tight">Salto</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/legal/terminos"
              className="text-xs px-3 py-1.5 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors font-medium"
            >
              Términos
            </Link>
            <Link
              href="/legal/privacidad"
              className="text-xs px-3 py-1.5 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors font-medium"
            >
              Privacidad
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-slate-100 mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-slate-400">
            <SaltoLogo size={18} />
            <span>© 2026 Salto. Barranquilla, Colombia.</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <Link href="/legal/terminos" className="hover:text-slate-700 transition-colors">
              Términos y Condiciones
            </Link>
            <Link href="/legal/privacidad" className="hover:text-slate-700 transition-colors">
              Política de Privacidad
            </Link>
            <Link href="/" className="hover:text-slate-700 transition-colors">
              Volver al producto
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
