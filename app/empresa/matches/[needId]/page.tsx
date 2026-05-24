'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  ArrowRight,
  UserCheck,
  Info,
  Network,
  Layers,
  ChevronRight,
  Quote,
  AlertCircle,
} from 'lucide-react';
import type { CompanyNeed, Match, ICSBreakdown } from '@/lib/types';
import { ICS_WEIGHTS } from '@/lib/types';
import MatchFeedback from '@/components/match-feedback';

interface MatchResponse {
  need: CompanyNeed;
  matches: Match[];
  note?: string;
  warning?: string;
  warningCode?: string;
}

const DIM_LABELS: { key: keyof ICSBreakdown; label: string; weight: number | null; help: string }[] = [
  { key: 'skillsFit', label: 'Skills', weight: ICS_WEIGHTS.skillsFit, help: 'Cobertura semántica de habilidades requeridas' },
  { key: 'behavioralFit', label: 'Conducta', weight: ICS_WEIGHTS.behavioralFit, help: 'Compatibilidad de rasgos con los deseados' },
  { key: 'learningSignal', label: 'Aprendizaje', weight: ICS_WEIGHTS.learningSignal, help: 'Evidencia de autodidactismo y adaptación' },
  { key: 'contextFit', label: 'Contexto', weight: ICS_WEIGHTS.contextFit, help: 'Encaje con el contexto operativo (caos, ritmo, recursos)' },
  { key: 'penalties', label: 'Penalización', weight: null, help: 'Restricciones duras incumplidas' },
];

/**
 * Fire-and-forget para señales implícitas (click conectar, propose microtask).
 * No bloqueamos al founder con esto; si falla, simplemente no se registra.
 * El motor lo va a leer en el próximo recálculo de scoreCandidates().
 */
function recordImplicitSignal(
  needId: string,
  profileId: string,
  signal: 'connect' | 'microtask_proposed',
  icsAtTime?: number,
) {
  try {
    void fetch('/api/feedback/implicit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ needId, profileId, signal, icsAtTime }),
      keepalive: true, // sobrevive navegación de página
    }).catch(() => {});
  } catch {
    /* never throws */
  }
}

function BreakdownBars({
  breakdown,
  size = 'md',
}: {
  breakdown: ICSBreakdown;
  size?: 'md' | 'lg';
}) {
  return (
    <div className={size === 'lg' ? 'space-y-3' : 'space-y-2'}>
      {DIM_LABELS.map(({ key, label, weight }) => {
        const value = breakdown[key];
        const isPenalty = key === 'penalties';
        return (
          <div key={key} className="flex items-center gap-3 text-xs">
            <div className={size === 'lg' ? 'w-32' : 'w-24'}>
              <div className="text-slate-700 font-medium">{label}</div>
              {weight !== null && (
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">peso {Math.round(weight * 100)}%</div>
              )}
            </div>
            <div className={`flex-1 ${size === 'lg' ? 'h-3' : 'h-2'} bg-slate-100 rounded-full overflow-hidden`}>
              <div
                className={`h-full rounded-full transition-all ${isPenalty ? 'bg-rose-400' : 'bg-emerald-500'}`}
                style={{ width: `${value}%` }}
              />
            </div>
            <span
              className={`${
                size === 'lg' ? 'w-12 text-sm' : 'w-9 text-xs'
              } text-right tabular-nums font-mono ${isPenalty ? 'text-rose-600' : 'text-slate-900'}`}
            >
              {Math.round(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PipelineVisual({ totalProfiles, shortlistSize, returnSize }: { totalProfiles: number; shortlistSize: number; returnSize: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full">
        <span className="font-mono tabular-nums font-semibold text-slate-700">{totalProfiles}</span>
        <span>perfiles</span>
      </span>
      <ChevronRight size={14} className="text-slate-300" />
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full">
        <Network size={12} />
        <span>embeddings</span>
      </span>
      <ChevronRight size={14} className="text-slate-300" />
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full">
        <span className="font-mono tabular-nums font-semibold text-slate-700">{shortlistSize}</span>
        <span>shortlist</span>
      </span>
      <ChevronRight size={14} className="text-slate-300" />
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full">
        <Layers size={12} />
        <span>LLM rankea</span>
      </span>
      <ChevronRight size={14} className="text-slate-300" />
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 text-white rounded-full">
        <Sparkles size={12} />
        <span className="font-mono tabular-nums font-semibold">{returnSize}</span>
        <span>candidatos</span>
      </span>
    </div>
  );
}

export default function MatchesPorNecesidad({ params }: { params: Promise<{ needId: string }> }) {
  const { needId } = use(params);
  const [data, setData] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ needId }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(json.error || 'No pudimos calcular los matches.');
          return;
        }
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError('Error de red.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-3 text-slate-500 mb-4">
          <Network size={18} className="text-emerald-500 animate-pulse" />
          <span className="text-sm">Calculando Índice de Compatibilidad…</span>
        </div>
        <div className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          Vectorizando tu necesidad, comparando contra perfiles por similitud semántica, y rankeando el shortlist con LLM. ~10 segundos.
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <AlertCircle size={32} className="text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-display font-medium mb-2">{error || 'No encontramos la necesidad'}</h2>
        <Link href="/empresa/chat">
          <Button className="mt-4">Publicar nueva necesidad</Button>
        </Link>
      </div>
    );
  }

  const { need, matches } = data;
  const [top, ...rest] = matches;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 sm:space-y-12">
      {/* Necesidad estructurada */}
      <header className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-600 font-semibold">Necesidad publicada</div>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight">
              {need.companyName}
            </h1>
            <p className="text-lg text-slate-700 max-w-3xl">{need.role}</p>
          </div>
          <Link href="/empresa/chat">
            <Button variant="outline" size="sm">Editar necesidad</Button>
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-amber-50/60 border border-amber-200/60 rounded-2xl p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] text-amber-800 font-semibold mb-2">Contexto operativo</div>
            <p className="text-slate-700 leading-relaxed">{need.context}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">Skills requeridos</div>
              <div className="flex flex-wrap gap-1.5">
                {need.requiredSkills.map((s) => (
                  <Badge key={s} variant="secondary" className="bg-white text-slate-700 border border-slate-200">{s}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">Rasgos deseados</div>
              <div className="flex flex-wrap gap-1.5">
                {need.desiredTraits.map((t) => (
                  <Badge key={t} variant="outline" className="bg-white border-emerald-200 text-emerald-800">{t}</Badge>
                ))}
              </div>
            </div>
            {need.hardConstraints.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-rose-600 font-semibold mb-2">Restricciones</div>
                <div className="flex flex-wrap gap-1.5">
                  {need.hardConstraints.map((c) => (
                    <Badge key={c} variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Aviso (rate-limit en ranking, contexto débil, etc.) */}
      {data.warning && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-amber-900"
        >
          <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold mb-0.5">Aviso del motor</div>
            <p className="leading-relaxed">{data.warning}</p>
          </div>
        </div>
      )}

      {/* Pipeline visual */}
      {matches.length > 0 && (
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1">Pipeline de matching</div>
              <div className="text-sm text-slate-700">
                <strong className="text-slate-900">Embeddings</strong> hacen shortlist semántico → <strong className="text-slate-900">LLM</strong> calcula el desglose ICS.
              </div>
            </div>
            <PipelineVisual totalProfiles={matches.length + 5} shortlistSize={15} returnSize={matches.length} />
          </div>
        </section>
      )}

      {/* Sin matches */}
      {matches.length === 0 && (
        <section className="border-2 border-dashed border-slate-300 bg-slate-50 rounded-2xl p-12 text-center">
          <UserCheck size={32} className="text-slate-400 mx-auto mb-4" />
          <h3 className="font-display font-semibold text-xl text-slate-900 mb-2">Aún no hay perfiles en SaltoAI</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Pide a algún joven que haga su entrevista, o ejecuta el seed (`curl localhost:3000/api/seed`) para cargar perfiles de demo.
          </p>
        </section>
      )}

      {/* Candidato #1 — HERO */}
      {top && (
        <section>
          <div className="flex items-center gap-2 mb-5">
            <Sparkles size={16} className="text-emerald-500" fill="currentColor" />
            <span className="text-xs uppercase tracking-[0.18em] text-emerald-700 font-semibold">Mejor match</span>
          </div>

          <article className="relative bg-gradient-to-br from-emerald-50 via-white to-amber-50/30 border border-emerald-200/60 rounded-3xl p-5 sm:p-8 md:p-10 shadow-sm overflow-hidden">
            <div className="grid md:grid-cols-12 gap-8 items-start relative">
              {/* Left: identity + score */}
              <div className="md:col-span-5 space-y-5">
                <div>
                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight">
                    {top.profileName}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {top.topSkills.map((s) => (
                      <Badge key={s} className="bg-slate-900 text-white border-transparent">{s}</Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-baseline gap-3 pt-4">
                  <span className="font-display font-bold text-5xl sm:text-7xl md:text-8xl text-emerald-600 tabular-nums leading-none">
                    {top.ics}
                  </span>
                  <div className="space-y-0.5">
                    <span className="text-2xl text-emerald-600 font-display font-bold">%</span>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">ICS</div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Link
                    href={`/joven/perfil/${top.profileId}`}
                    className="flex-1"
                    onClick={() => recordImplicitSignal(needId, top.profileId, 'connect', top.ics)}
                  >
                    <Button className="w-full gap-2">
                      Ver perfil completo <ArrowRight size={14} />
                    </Button>
                  </Link>
                  <Link
                    href={`/empresa/probar/${top.profileId}?needId=${needId}`}
                    onClick={() => recordImplicitSignal(needId, top.profileId, 'microtask_proposed', top.ics)}
                  >
                    <Button variant="outline" className="gap-2">
                      Probar candidato
                    </Button>
                  </Link>
                </div>

                {/* Feedback loop — combustible del flywheel (PRD §8.6) */}
                <div className="pt-3">
                  <MatchFeedback needId={needId} profileId={top.profileId} icsAtTime={top.ics} variant="hero" />
                </div>
              </div>

              {/* Right: breakdown + reason */}
              <div className="md:col-span-7 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-4">
                    Desglose ICS · auditable
                  </div>
                  <BreakdownBars breakdown={top.breakdown} size="lg" />
                </div>

                <div className="bg-white/80 backdrop-blur rounded-2xl border border-emerald-200/60 p-6 relative">
                  <Quote size={20} className="absolute -top-2.5 left-6 bg-white border border-emerald-200 rounded-full p-1 text-emerald-600" />
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">Por qué hace match</div>
                  <p className="font-display text-lg text-slate-900 leading-snug">{top.reason}</p>
                </div>

                <div className="flex items-start gap-2.5 text-xs text-slate-600 px-1">
                  <Info size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
                  <span><strong className="text-slate-900 font-semibold">Red flag IA:</strong> {top.redFlag}</span>
                </div>
              </div>
            </div>
          </article>
        </section>
      )}

      {/* Candidatos #2 y #3 */}
      {rest.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">Otros candidatos compatibles</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {rest.map((m, idx) => (
              <article
                key={m.profileId}
                className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-slate-300 hover:shadow-sm transition-all flex flex-col"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold mb-1">
                      #{idx + 2}
                    </div>
                    <h3 className="font-display font-semibold text-2xl text-slate-900 tracking-tight">{m.profileName}</h3>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-4xl text-slate-700 tabular-nums leading-none">{m.ics}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mt-0.5">ICS</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-5">
                  {m.topSkills.map((s) => (
                    <Badge key={s} variant="secondary" className="bg-slate-100 text-slate-700 border-transparent font-normal">{s}</Badge>
                  ))}
                </div>

                <BreakdownBars breakdown={m.breakdown} />

                <div className="mt-5 mb-4 pl-3 border-l-2 border-emerald-200">
                  <p className="text-sm text-slate-700 leading-relaxed italic">"{m.reason}"</p>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100 flex items-start justify-between gap-3">
                  <div className="text-xs text-slate-500 flex gap-1.5 items-start flex-1">
                    <Info size={12} className="mt-0.5 flex-shrink-0" />
                    <span><strong className="text-slate-700">Red flag:</strong> {m.redFlag}</span>
                  </div>
                  <Link
                    href={`/joven/perfil/${m.profileId}`}
                    onClick={() => recordImplicitSignal(needId, m.profileId, 'connect', m.ics)}
                  >
                    <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0">
                      Ver perfil <ArrowRight size={12} />
                    </Button>
                  </Link>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100">
                  <MatchFeedback needId={needId} profileId={m.profileId} icsAtTime={m.ics} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Filosofía Salto */}
      {matches.length > 0 && (
        <section className="bg-slate-950 text-white rounded-2xl p-6 sm:p-8 md:p-10 text-center relative overflow-hidden">
          <UserCheck size={28} className="mx-auto mb-4 text-emerald-400" />
          <h3 className="font-display font-semibold text-2xl md:text-3xl mb-3 tracking-tight">
            Salto promete <span className="text-emerald-400">calidad</span>, no volumen.
          </h3>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            No verás 100 CVs aquí. Solo los candidatos cuyo potencial encaja con tu contexto real, con evidencia citada y score auditable. Cada contratación que confirmes reentrena el motor.
          </p>
        </section>
      )}
    </div>
  );
}
