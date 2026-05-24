'use client';

/**
 * `/empresa/matches` — lista de TODAS las necesidades publicadas por el
 * founder con su shortcut a /empresa/matches/{needId}.
 *
 * Antes era una página estática "publica primero" → desconcertante porque
 * el nav dice "Mis matches" y el founder venía con needs publicadas.
 *
 * Comportamiento:
 *  - Sin sesión: empty state que invita a loguearse + publicar
 *  - Con sesión sin needs: empty state + CTA a /empresa/chat
 *  - Con sesión y needs: lista cards con companyName, role, fecha,
 *    badge "Legal validada" si aplica, link a sus matches.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ArrowRight,
  LayoutDashboard,
  Building2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import type { CompanyNeed } from '@/lib/types';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function MatchesIndex() {
  const { user, loading: authLoading } = useAuth();
  const [needs, setNeeds] = useState<CompanyNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/necesidad/mias?uid=${encodeURIComponent(user.uid)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || 'No pudimos cargar tus necesidades.');
          return;
        }
        setNeeds((json.needs as CompanyNeed[]) ?? []);
      } catch {
        if (!cancelled) setError('Error de red.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="h-8 w-1/3 bg-slate-200 rounded animate-pulse mb-3" />
        <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse mb-8" />
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 bg-slate-50 border border-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-24 text-center">
        <AlertCircle className="text-rose-500 mx-auto mb-4" size={32} />
        <p className="text-slate-700 mb-6">{error}</p>
        <Link href="/empresa">
          <Button variant="outline">Volver a mi inicio</Button>
        </Link>
      </div>
    );
  }

  // Empty state
  if (needs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-24 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-slate-900 text-emerald-400 flex items-center justify-center">
          <Sparkles size={28} strokeWidth={1.75} />
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Necesitas publicar primero
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight mb-4 leading-tight">
          Publica una necesidad y verás hasta 10 candidatos con desglose ICS.
        </h1>
        <p className="text-slate-600 leading-relaxed mb-8">
          Cuéntanos tu contexto real en lenguaje natural. La IA lo estructura, busca por
          compatibilidad semántica y te devuelve los mejores 10 con score explicable — no 200 CVs.
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

  // Lista de necesidades
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
            Mis necesidades publicadas
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
            {needs.length === 1
              ? 'Tu necesidad activa'
              : `Tus ${needs.length} necesidades activas`}
          </h1>
          <p className="text-slate-600 mt-2 text-sm leading-relaxed max-w-xl">
            Cada una con su shortlist de hasta 10 candidatos rankeados por ICS. Hacé clic para
            ver el desglose por candidato.
          </p>
        </div>
        <Link href="/empresa/chat">
          <Button className="gap-2">
            <Sparkles size={14} /> Publicar nueva
          </Button>
        </Link>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {needs.map((need) => (
          <Link key={need.id} href={`/empresa/matches/${need.id}`}>
            <article className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-sm transition-all h-full flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
                    {need.companyName}
                  </div>
                  <h3 className="font-display font-semibold text-lg text-slate-900 leading-tight">
                    {need.role || 'Necesidad sin título'}
                  </h3>
                </div>
                <ArrowRight
                  size={16}
                  className="text-slate-300 group-hover:text-emerald-600 transition-colors flex-shrink-0 mt-1"
                />
              </div>

              {need.context && (
                <p className="text-xs text-slate-600 leading-relaxed mb-3 line-clamp-2">
                  {need.context}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 mb-3">
                {need.requiredSkills.slice(0, 4).map((s) => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="bg-slate-100 text-slate-700 border-transparent text-[10.5px] font-normal"
                  >
                    {s}
                  </Badge>
                ))}
                {need.requiredSkills.length > 4 && (
                  <span className="text-[10.5px] text-slate-500 self-center">
                    +{need.requiredSkills.length - 4}
                  </span>
                )}
              </div>

              <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Publicada {formatDate(need.createdAt)}</span>
                {need.legal ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <ShieldCheck size={12} /> Legal validada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertCircle size={12} /> Sin datos legales
                  </span>
                )}
              </div>
            </article>
          </Link>
        ))}
      </div>

      <div className="bg-slate-950 text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <Building2 size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-300 leading-relaxed">
            Cuando un candidato te interese, podés <strong className="text-white">proponer una micro-tarea pagada</strong> para probarlo antes de contratación formal. Pagas por evidencia, no por una conversación.
          </p>
        </div>
        <Link href="/empresa">
          <Button variant="outline" className="bg-transparent border-slate-600 text-white hover:bg-slate-800 gap-2 flex-shrink-0">
            <LayoutDashboard size={14} /> Mi inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}
