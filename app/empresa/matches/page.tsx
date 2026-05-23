import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, LayoutDashboard } from 'lucide-react';

/**
 * Empty state genérico cuando el founder entra a `/empresa/matches` sin un
 * needId. La página principal de matches vive en `/empresa/matches/[needId]`,
 * y la home del founder en `/empresa`. Este page es solo el fallback
 * cuando alguien escribe la URL a mano o llega vía link viejo.
 */
export default function MatchesIndex() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-slate-900 text-emerald-400 flex items-center justify-center">
        <Sparkles size={28} strokeWidth={1.75} />
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
        Necesitás publicar primero
      </div>
      <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight mb-4 leading-tight">
        Publicá una necesidad y verás 3 candidatos con desglose ICS.
      </h1>
      <p className="text-slate-600 leading-relaxed mb-8">
        Contanos tu contexto real en lenguaje natural. La IA lo estructura, busca por
        compatibilidad semántica y te devuelve los 3 mejores con score explicable — no 200 CVs.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Link href="/empresa/chat">
          <Button size="lg" className="gap-2">
            Publicar necesidad <ArrowRight size={16} />
          </Button>
        </Link>
        <Link href="/empresa">
          <Button size="lg" variant="outline" className="gap-2">
            <LayoutDashboard size={16} /> Ir a mi inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}
