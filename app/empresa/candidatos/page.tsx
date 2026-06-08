'use client';

/**
 * "Mis candidatos" — la reclutadora ve a los jóvenes que entrevistó a través
 * de su link de marca (`/r/[slug]`). Gateado a rol empresa por el layout.
 *
 * Lee de GET /api/empresa/candidatos?uid= (subset seguro) y enlaza al detalle
 * existente en /empresa/candidatos/[profileId].
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Users, ArrowRight, Sparkles, ExternalLink } from 'lucide-react';

interface Candidate {
  id: string;
  name: string;
  summary: string;
  skills: string[];
  createdAt: number;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MisCandidatosPage() {
  const { user, loading } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/empresa/candidatos?uid=${encodeURIComponent(user.uid)}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
        }
      } catch {
        /* empty state lo cubre */
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  if (loading || !user) {
    return <LoadingSpinner variant="full" label="Cargando…" />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-6">
      <header>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Tus candidatos
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight leading-tight">
          Mis candidatos
        </h1>
        <p className="text-slate-600 mt-2 max-w-2xl leading-relaxed">
          Jóvenes que hicieron tu entrevista personalizada a través de tu link de marca.
        </p>
      </header>

      {dataLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <LoadingSpinner variant="block" label="Cargando candidatos…" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-gradient-to-br from-emerald-50/40 via-white to-amber-50/30 border border-emerald-200/40 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Users size={22} strokeWidth={1.75} />
          </div>
          <h3 className="font-display font-bold text-xl text-slate-900 mb-2 tracking-tight">
            Aún no tienes candidatos.
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-6">
            Comparte tu link de entrevista y cada joven que la complete aparecerá aquí con su Perfil
            de Evidencia.
          </p>
          <div className="flex justify-center gap-2">
            <Link href="/empresa/entrevistador">
              <Button className="gap-2">
                <Sparkles size={14} /> Configurar y compartir mi link
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {candidates.map((c) => (
            <Link key={c.id} href={`/empresa/candidatos/${c.id}`}>
              <div className="group bg-white border border-slate-200 rounded-2xl p-5 transition-all hover:border-emerald-300 hover:shadow-sm h-full flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-display font-semibold text-lg text-slate-900 leading-tight">
                    {c.name || 'Candidato/a'}
                  </h3>
                  <ArrowRight
                    size={16}
                    className="text-slate-300 group-hover:text-emerald-600 transition-colors flex-shrink-0 mt-1"
                  />
                </div>
                {c.summary && (
                  <p className="text-xs text-slate-600 leading-relaxed mb-3 line-clamp-3 flex-1">
                    {c.summary}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {c.skills.slice(0, 4).map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="bg-slate-100 text-slate-700 border-transparent text-[10.5px] font-normal"
                    >
                      {s}
                    </Badge>
                  ))}
                  {c.skills.length > 4 && (
                    <span className="text-[10.5px] text-slate-500 self-center">+{c.skills.length - 4}</span>
                  )}
                </div>
                <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">
                  Entrevistado {formatDate(c.createdAt)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-400 justify-center pt-2">
        <ExternalLink size={13} /> ¿Aún no compartes tu link?{' '}
        <Link href="/empresa/entrevistador" className="text-emerald-700 underline">
          Configúralo aquí
        </Link>
      </div>
    </div>
  );
}
