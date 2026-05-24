'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { MatchPulseLoader } from '@/components/ui/match-pulse-loader';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  ArrowRight,
  UserCheck,
  Info,
  Network,
  Layers,
  ChevronRight,
  ChevronDown,
  Quote,
  AlertCircle,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Lock,
} from 'lucide-react';
import type { CompanyNeed, Match, ICSBreakdown, MatchDecision } from '@/lib/types';
import { isNeedClosed } from '@/lib/need-status';
import { CloseNeedControl } from '@/components/empresa/close-need-control';
import { storeMatchForNavigation } from '@/lib/match-navigation-storage';
import { ICS_WEIGHTS } from '@/lib/types';
import MatchFeedback from '@/components/match-feedback';
import { useAuth } from '@/lib/auth-context';
import { FeedbackThumbs } from '@/components/feedback/thumbs';
import { FeedbackInlinePrompt } from '@/components/feedback/inline-prompt';
import { NeedRadiography } from '@/components/empresa/need-radiography';
import MatchingAnimation from '@/components/matching-animation';
import { emitSignal } from '@/lib/feedback';

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
 *
 * Doble pipe:
 *   1. /api/feedback/implicit (legacy) — lo lee scoreCandidates() para ajustar
 *      el ranking en tiempo real (sí, hace recálculo on-the-fly).
 *   2. /api/feedback (v3) — alimenta el flywheel dashboard con touchpoint
 *      tipado (profile_click | microtask_proposed). Sin esto el dashboard
 *      de §8.6 no ve estas señales.
 *
 * Ambos endpoints son idempotentes server-side, así que duplicar no rompe.
 */
function recordImplicitSignal(
  needId: string,
  profileId: string,
  signal: 'connect' | 'microtask_proposed',
  icsAtTime?: number,
) {
  // 1. Legacy: el motor lo necesita para ajustes inmediatos.
  try {
    void fetch('/api/feedback/implicit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ needId, profileId, signal, icsAtTime }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throws */
  }
  // 2. v3: el flywheel dashboard. profile_click cuando el founder abre el
  //    perfil, microtask_proposed cuando lo manda a /empresa/probar.
  const touchpoint =
    signal === 'connect' ? 'profile_click' : 'microtask_proposed';
  void emitSignal({
    kind: 'implicit',
    touchpoint,
    targetType: 'match',
    targetId: `${needId}__${profileId}`,
    needId,
    profileId,
    icsAtTime,
  });
}

function candidateHref(needId: string, profileId: string) {
  return `/empresa/candidatos/${profileId}?needId=${encodeURIComponent(needId)}`;
}

function openCandidate(needId: string, match: Match) {
  storeMatchForNavigation(needId, match.profileId, match);
}

function decisionFor(
  decisions: MatchDecision[],
  profileId: string
): MatchDecision['status'] | undefined {
  return decisions.find((d) => d.profileId === profileId)?.status;
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
            <div className={size === 'lg' ? 'w-24 sm:w-32' : 'w-20 sm:w-24'}>
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

// Cache cliente de matches por needId (TTL 15 min).
//
// Antes cada visita a /empresa/matches/[needId] disparaba un POST a
// /api/match → 10-15s de espera porque corre LLM batch. Si el founder
// hace "Atrás" y vuelve, no debería esperar otra vez por el mismo cálculo.
// localStorage persiste entre visitas; el botón "Recalcular" fuerza refresh.
const MATCH_CACHE_TTL_MS = 15 * 60 * 1000;

interface CachedMatches {
  data: MatchResponse;
  timestamp: number;
}

function matchCacheKey(needId: string): string {
  return `salto.matches.${needId}`;
}

function readMatchCache(needId: string): CachedMatches | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(matchCacheKey(needId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMatches;
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > MATCH_CACHE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeMatchCache(needId: string, data: MatchResponse) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      matchCacheKey(needId),
      JSON.stringify({ data, timestamp: Date.now() }),
    );
  } catch {
    /* quota */
  }
}

function clearMatchCache(needId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(matchCacheKey(needId));
  } catch {
    /* ignore */
  }
}

export default function MatchesPorNecesidad({ params }: { params: Promise<{ needId: string }> }) {
  const { needId } = use(params);
  const { user } = useAuth();
  const [data, setData] = useState<MatchResponse | null>(null);
  const [decisions, setDecisions] = useState<MatchDecision[]>([]);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDecisions = async () => {
    try {
      const decisionRes = await fetch(
        `/api/match/decision?needId=${encodeURIComponent(needId)}`,
      );
      const decisionJson = decisionRes.ok ? await decisionRes.json() : { decisions: [] };
      setDecisions(decisionJson.decisions ?? []);
    } catch {
      /* decisions are non-blocking */
    }
  };

  const fetchMatches = async (opts: { useCache: boolean; force?: boolean }) => {
    if (opts.useCache && !opts.force) {
      const cached = readMatchCache(needId);
      if (cached) {
        setData(cached.data);
        setFromCache(true);
        setLoading(false);
        void fetchDecisions();
        return;
      }
    }
    setRefreshing(true);
    try {
      const matchRes = opts.force
        ? await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ needId, force: true }),
          })
        : await fetch(`/api/match?needId=${encodeURIComponent(needId)}`);
      const [json, decisionRes] = await Promise.all([
        matchRes.json(),
        fetch(`/api/match/decision?needId=${encodeURIComponent(needId)}`),
      ]);
      if (!matchRes.ok) {
        setError(json.error || 'No pudimos calcular los matches.');
        return;
      }
      const decisionJson = decisionRes.ok ? await decisionRes.json() : { decisions: [] };
      setData(json);
      setDecisions(decisionJson.decisions ?? []);
      setFromCache(false);
      writeMatchCache(needId, json);
    } catch {
      setError('Error de red.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchMatches({ useCache: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needId]);

  const { activeMatches, discardedMatches } = useMemo(() => {
    if (!data?.matches) return { activeMatches: [], discardedMatches: [] };
    const active: Match[] = [];
    const discarded: Match[] = [];
    for (const m of data.matches) {
      const st = decisionFor(decisions, m.profileId);
      if (st === 'discarded') discarded.push(m);
      else active.push(m);
    }
    return { activeMatches: active, discardedMatches: discarded };
  }, [data?.matches, decisions]);

  async function quickDecision(profileId: string, status: 'interested' | 'discarded', ics?: number) {
    if (!user?.uid) return;
    await fetch('/api/match/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        needId,
        profileId,
        companyId: user.uid,
        status,
        ...(typeof ics === 'number' && { icsAtTime: ics }),
      }),
    });
    setDecisions((prev) => {
      const id = `${needId}__${profileId}`;
      const next = prev.filter((d) => d.profileId !== profileId);
      next.push({
        id,
        needId,
        profileId,
        companyId: user.uid,
        status,
        updatedAt: Date.now(),
        ...(typeof ics === 'number' && { icsAtTime: ics }),
      });
      return next;
    });
  }

  const forceRefresh = () => {
    if (refreshing || (data?.need && isNeedClosed(data.need))) return;
    clearMatchCache(needId);
    void fetchMatches({ useCache: false, force: true });
  };

  const needClosed = data?.need ? isNeedClosed(data.need) : false;

  if (loading) {
    return <MatchingAnimation variant="candidates" />;
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-24 text-center">
        <AlertCircle size={32} className="text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-display font-medium mb-2">{error || 'No encontramos la necesidad'}</h2>
        <Link href="/empresa/chat">
          <Button className="mt-4">Publicar nueva necesidad</Button>
        </Link>
      </div>
    );
  }

  const { need, matches } = data;
  const [top, ...rest] = activeMatches;

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 sm:space-y-12">
      {refreshing && (
        <MatchPulseLoader variant="overlay" label="Recalculando candidatos…" />
      )}
      {/* Necesidad estructurada */}
      <header className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-600 font-semibold">Necesidad publicada</div>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight">
              {need.companyName}
            </h1>
            <p className="text-lg text-slate-700 max-w-3xl">{need.role}</p>
            {need.jobNature && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={
                    need.jobNature === 'cuantitativa'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : need.jobNature === 'cualitativa'
                        ? 'bg-violet-50 text-violet-800 border-violet-200'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                  }
                  title={
                    need.jobNature === 'cuantitativa'
                      ? 'El motor pondera ALTO los resultados medibles del candidato.'
                      : need.jobNature === 'cualitativa'
                        ? 'El motor NO castiga al candidato por no traer métricas — valora detalle, constancia y confiabilidad.'
                        : 'Pesos balanceados; no se favorece ni penaliza la ausencia de métricas.'
                  }
                >
                  Rol {need.jobNature}
                </Badge>
                {need.jobNatureReason && (
                  <span className="text-slate-500 italic max-w-md truncate" title={need.jobNatureReason}>
                    {need.jobNatureReason}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {needClosed ? (
              <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 gap-1">
                <Lock size={12} /> Vacante cerrada
              </Badge>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={forceRefresh}
                  disabled={refreshing}
                  className="gap-1.5"
                  title="Recalcular el ranking de candidatos contra esta necesidad"
                >
                  <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? 'Recalculando…' : 'Recalcular'}
                </Button>
                {user?.uid && (
                  <CloseNeedControl
                    need={need}
                    companyId={user.uid}
                    onClosed={(closed) => setData((prev) => (prev ? { ...prev, need: closed } : prev))}
                  />
                )}
              </>
            )}
            <Link href="/empresa/chat">
              <Button variant="outline" size="sm">Nueva necesidad</Button>
            </Link>
          </div>
        </div>

        {needClosed && (
          <div
            role="status"
            className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 flex items-start gap-2"
          >
            <Lock size={16} className="text-slate-500 mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              Esta vacante está <strong>cerrada</strong>. Los candidatos que ves son el ranking
              histórico; ningún joven nuevo la verá en Oportunidades ni recibirá match automático.
              {need.hiredOnClose === true && ' Reportaste contratación exitosa.'}
              {need.hiredOnClose === false && ' Cerraste sin contratación de esta búsqueda.'}
            </p>
          </div>
        )}

        {fromCache && !refreshing && !needClosed && (
          <p className="text-[11px] text-slate-400 italic flex items-center gap-1">
            <CheckCircle2 size={11} className="text-emerald-500" />
            Resultados cacheados (15 min). Si publicaste cambios o subieron nuevos perfiles, dale a "Recalcular".
          </p>
        )}

        <div className="grid gap-4">
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

      {/* Feedback "¿la IA capturó bien tu necesidad?" — aparece la PRIMERA
          vez que el founder ve esta página (el dedup del componente vía
          localStorage garantiza una sola aparición por needId). Critical:
          si el founder dice "no", el structuring del prompt es la palanca
          más alta — un error aquí contamina todo el matching downstream. */}
      <FeedbackInlinePrompt
        question="¿La IA capturó bien tu necesidad?"
        hint="Mirá los skills, rasgos y restricciones de arriba. ¿Reflejan lo que dijiste en la entrevista?"
        variant="rating"
        touchpoint="need_structuring"
        targetType="need"
        targetId={needId}
        dismissible
      />

      {/* Radiografía — dashboard rico antes de los matches.
          Convierte la página en una vista de inteligencia operativa:
          KPIs + salud + histograma + dimensiones + skills coverage +
          perfil de empresa + engagement. Reduce la fricción para que
          el founder entienda QUÉ es lo que está mirando antes de ir
          candidato por candidato. */}
      <NeedRadiography need={need} matches={matches} needId={needId} />

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
      {activeMatches.length > 0 && (
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1">Pipeline de matching</div>
              <div className="text-sm text-slate-700">
                <strong className="text-slate-900">Embeddings</strong> hacen shortlist semántico → <strong className="text-slate-900">LLM</strong> calcula el desglose ICS.
              </div>
            </div>
            <PipelineVisual totalProfiles={activeMatches.length + 5} shortlistSize={15} returnSize={activeMatches.length} />
          </div>
        </section>
      )}

      {/* Sin matches */}
      {activeMatches.length === 0 && discardedMatches.length === 0 && (
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
                  <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight">
                    {top.profileName}
                  </h2>
                  {decisionFor(decisions, top.profileId) === 'interested' && (
                    <Badge className="mt-2 bg-emerald-600 text-white border-transparent">Interesado</Badge>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {top.topSkills.map((s) => {
                      const verified = top.verifiedSkills?.find(
                        (v) => v.skill.toLowerCase() === s.toLowerCase(),
                      );
                      return verified ? (
                        <Badge
                          key={s}
                          className="bg-emerald-600 text-white border-transparent gap-1"
                          title={`Verificada por documento — "${verified.evidence}"`}
                        >
                          <CheckCircle2 size={11} /> {s}
                        </Badge>
                      ) : (
                        <Badge key={s} className="bg-slate-900 text-white border-transparent">{s}</Badge>
                      );
                    })}
                  </div>
                  {top.verifiedSkills && top.verifiedSkills.length > 0 && (
                    <p className="text-[11px] text-emerald-700 mt-2 inline-flex items-center gap-1">
                      <CheckCircle2 size={11} /> {top.verifiedSkills.length} skill{top.verifiedSkills.length === 1 ? '' : 's'} verificada{top.verifiedSkills.length === 1 ? '' : 's'} con documento
                    </p>
                  )}
                </div>

                <div className="flex items-baseline gap-3 pt-4">
                  <span className="font-display font-bold text-4xl sm:text-5xl md:text-7xl lg:text-8xl text-emerald-600 tabular-nums leading-none">
                    {top.ics}
                  </span>
                  <div className="space-y-0.5">
                    <span className="text-2xl text-emerald-600 font-display font-bold">%</span>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">ICS</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    href={candidateHref(needId, top.profileId)}
                    className="flex-1 min-w-[140px]"
                    onClick={() => {
                      openCandidate(needId, top);
                      recordImplicitSignal(needId, top.profileId, 'connect', top.ics);
                    }}
                  >
                    <Button className="w-full gap-2">
                      Ver perfil completo <ArrowRight size={14} />
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Me interesa"
                    onClick={() => void quickDecision(top.profileId, 'interested', top.ics)}
                  >
                    <ThumbsUp size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Descartar"
                    onClick={() => void quickDecision(top.profileId, 'discarded', top.ics)}
                  >
                    <ThumbsDown size={16} />
                  </Button>
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
                {/* Calibración del red flag: ¿el aviso de la IA fue acertado
                    o ruido? Ground-truth crítico — si vemos muchos "no"
                    sistemáticos en una dimensión, ajustamos el prompt. */}
                {top.redFlag && top.redFlag !== 'Ninguna señal negativa visible.' && (
                  <div className="bg-white/60 backdrop-blur border border-slate-200 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-slate-600">
                      ¿Este red flag fue acertado?
                    </span>
                    <FeedbackThumbs
                      label=""
                      layout="inline"
                      silent
                      touchpoint="red_flag_accuracy"
                      targetType="match"
                      targetId={`${needId}__${top.profileId}`}
                      needId={needId}
                      profileId={top.profileId}
                    />
                  </div>
                )}
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
                    {decisionFor(decisions, m.profileId) === 'interested' && (
                      <Badge className="mt-1 bg-emerald-600 text-white border-transparent text-[10px]">
                        Interesado
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-4xl text-slate-700 tabular-nums leading-none">{m.ics}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mt-0.5">ICS</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-5">
                  {m.topSkills.map((s) => {
                    const verified = m.verifiedSkills?.find(
                      (v) => v.skill.toLowerCase() === s.toLowerCase(),
                    );
                    return verified ? (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="bg-emerald-50 text-emerald-800 border border-emerald-200 gap-1"
                        title={`Verificada por documento — "${verified.evidence}"`}
                      >
                        <CheckCircle2 size={11} /> {s}
                      </Badge>
                    ) : (
                      <Badge key={s} variant="secondary" className="bg-slate-100 text-slate-700 border-transparent font-normal">{s}</Badge>
                    );
                  })}
                </div>

                <BreakdownBars breakdown={m.breakdown} />

                <div className="mt-5 mb-4 pl-3 border-l-2 border-emerald-200">
                  <p className="text-sm text-slate-700 leading-relaxed italic">"{m.reason}"</p>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100 flex items-start justify-between gap-3 flex-wrap">
                  <div className="text-xs text-slate-500 flex gap-1.5 items-start flex-1 min-w-[180px]">
                    <Info size={12} className="mt-0.5 flex-shrink-0" />
                    <span><strong className="text-slate-700">Red flag:</strong> {m.redFlag}</span>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Me interesa"
                      onClick={() => void quickDecision(m.profileId, 'interested', m.ics)}
                    >
                      <ThumbsUp size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Descartar"
                      onClick={() => void quickDecision(m.profileId, 'discarded', m.ics)}
                    >
                      <ThumbsDown size={14} />
                    </Button>
                    <Link
                      href={candidateHref(needId, m.profileId)}
                      onClick={() => {
                        openCandidate(needId, m);
                        recordImplicitSignal(needId, m.profileId, 'connect', m.ics);
                      }}
                    >
                      <Button size="sm" variant="outline" className="gap-1.5">
                        Ver perfil <ArrowRight size={12} />
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100">
                  <MatchFeedback needId={needId} profileId={m.profileId} icsAtTime={m.ics} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {discardedMatches.length > 0 && (
        <section className="border border-slate-200 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDiscarded((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-slate-50 hover:bg-slate-100/80 text-left transition-colors"
          >
            <span className="text-sm font-semibold text-slate-700">
              Descartados ({discardedMatches.length})
            </span>
            <ChevronDown
              size={18}
              className={`text-slate-500 transition-transform ${showDiscarded ? 'rotate-180' : ''}`}
            />
          </button>
          {showDiscarded && (
            <div className="p-5 space-y-3 border-t border-slate-200 bg-white">
              {discardedMatches.map((m) => (
                <div
                  key={m.profileId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <div className="font-medium text-slate-800">{m.profileName}</div>
                    <div className="text-xs text-slate-500">ICS {m.ics}%</div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={candidateHref(needId, m.profileId)}
                      onClick={() => openCandidate(needId, m)}
                    >
                      <Button size="sm" variant="outline">
                        Ver perfil
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void quickDecision(m.profileId, 'interested', m.ics)}
                    >
                      Recuperar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Filosofía Salto */}
      {data.matches.length > 0 && (
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
