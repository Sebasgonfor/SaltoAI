'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Building2,
  Sparkles,
  AlertCircle,
  Network,
  MessageSquareQuote,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { Gender, OpportunityMatch, Profile } from '@/lib/types';
import {
  mergeDecisionsIntoOpportunities,
  type EnrichedDecision,
} from '@/lib/merge-opportunity-decisions';
import { RoleGate } from '@/components/auth/role-gate';
import { MatchPulseLoader } from '@/components/ui/match-pulse-loader';
import { useEmitSignal } from '@/hooks/use-emit-signal';

const DECISION_POLL_MS = 12_000;

// --- Cache cliente de oportunidades (5 min) ---
//
// Antes cada visita a /joven/conectar disparaba un POST a /api/oportunidades
// que internamente llama a Gemini N veces (una por necesidad del shortlist).
// Eso es: latencia visible + cuota gastada + ICSs que cambian sutilmente
// entre visitas porque Gemini no es determinístico.
// Cacheamos por profileId en localStorage con TTL de 5 minutos. Mientras el
// cache está vivo, renderizamos al instante. Más allá, refrescamos en bg.

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedOpportunities {
  profile: Profile;
  opportunities: OpportunityMatch[];
  note: string | null;
  warning: string | null;
  timestamp: number;
}

function cacheKey(profileId: string): string {
  return `salto_oportunidades_${profileId}`;
}

function readCache(profileId: string): CachedOpportunities | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedOpportunities;
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(profileId: string, data: Omit<CachedOpportunities, 'timestamp'>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      cacheKey(profileId),
      JSON.stringify({ ...data, timestamp: Date.now() })
    );
  } catch {
    /* quota errors → ignoramos, no es crítico */
  }
}

function clearCacheFor(profileId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(cacheKey(profileId));
  } catch {
    /* ignore */
  }
}

const GENDER_LABEL: Record<Gender, string> = {
  mujer: 'Mujer',
  hombre: 'Hombre',
  otro: 'Otro',
  prefiero_no_decir: '',
};

function ConectarContent() {
  const searchParams = useSearchParams();
  const profileIdFromUrl = searchParams.get('profileId');
  const emit = useEmitSignal();
  const [profileId, setProfileId] = useState<string | null>(profileIdFromUrl);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityMatch[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Set de needIds donde el joven ya expresó interés. Persiste en
  // localStorage por profileId para que el botón siga marcado "Conectaste"
  // después de un refresh.
  const [connectedNeeds, setConnectedNeeds] = useState<Set<string>>(new Set());
  // needId que está en proceso de "conectar" (mientras corre el POST).
  const [connectingNeedId, setConnectingNeedId] = useState<string | null>(null);

  useEffect(() => {
    if (!profileIdFromUrl) {
      try {
        const stored = localStorage.getItem('salto_last_profile_id');
        if (stored) setProfileId(stored);
      } catch {
        /* ignore */
      }
    }
  }, [profileIdFromUrl]);

  // Restaurar el set de necesidades a las que ya conectó este joven.
  // Por profileId — no cruzamos sesiones.
  useEffect(() => {
    if (!profileId) return;
    try {
      const raw = localStorage.getItem(`salto.connected_needs.${profileId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setConnectedNeeds(new Set(parsed));
      }
    } catch {
      /* ignore */
    }
  }, [profileId]);

  /**
   * Registra que el joven quiere conectar con una empresa. MVP sin mensajería:
   *   1. POST /api/feedback/implicit con signalType="joven_interest" — la
   *      empresa lo verá como señal bidireccional (si ya hubo profile_click
   *      del founder, es match mutuo de alta señal).
   *   2. Persiste en localStorage para que el botón quede "Conectaste" tras
   *      refresh.
   *   3. UI optimista — marca antes de que vuelva el server. Si falla, rollback.
   */
  const handleConnect = async (needId: string, ics: number) => {
    if (!profileId || connectingNeedId || connectedNeeds.has(needId)) return;
    setConnectingNeedId(needId);
    // Optimistic
    const previous = connectedNeeds;
    const next = new Set(connectedNeeds);
    next.add(needId);
    setConnectedNeeds(next);
    try {
      localStorage.setItem(
        `salto.connected_needs.${profileId}`,
        JSON.stringify(Array.from(next)),
      );
    } catch {
      /* quota */
    }

    try {
      const res = await fetch('/api/feedback/implicit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needId,
          profileId,
          signal: 'joven_interest',
          icsAtTime: ics,
          jovenSource: 'oportunidades',
        }),
      });
      if (!res.ok) throw new Error('feedback save failed');
    } catch {
      // Rollback
      setConnectedNeeds(previous);
      try {
        localStorage.setItem(
          `salto.connected_needs.${profileId}`,
          JSON.stringify(Array.from(previous)),
        );
      } catch {
        /* ignore */
      }
      setError('No pudimos registrar tu interés. Inténtalo de nuevo.');
    } finally {
      setConnectingNeedId(null);
    }
  };

  const fetchOpportunities = useMemo(
    () =>
      async (pid: string, opts: { useCache: boolean }) => {
        // 1. Si hay cache fresco y nos lo permiten, lo usamos al instante.
        if (opts.useCache) {
          const cached = readCache(pid);
          if (cached) {
            setProfile(cached.profile);
            setOpportunities(cached.opportunities);
            setNote(cached.note);
            setWarning(cached.warning);
            setFromCache(true);
            setLoading(false);
            return;
          }
        }

        // 2. Sin cache: marcamos refreshing si ya había datos visibles, o
        // loading completo si es la primera vez.
        setRefreshing(true);
        try {
          const res = await fetch('/api/oportunidades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId: pid }),
          });
          const json = await res.json();
          if (!res.ok) {
            setError(json.error || 'No pudimos cargar oportunidades.');
            return;
          }
          setProfile(json.profile);
          setOpportunities(json.opportunities || []);
          setNote(json.note || null);
          setWarning(json.warning || null);
          setFromCache(false);
          writeCache(pid, {
            profile: json.profile,
            opportunities: json.opportunities || [],
            note: json.note || null,
            warning: json.warning || null,
          });
        } catch {
          setError('Error de red.');
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
    []
  );

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      return;
    }
    clearCacheFor(profileId);
    void fetchOpportunities(profileId, { useCache: false });
  }, [profileId, fetchOpportunities]);

  const forceRefresh = () => {
    if (!profileId || refreshing) return;
    clearCacheFor(profileId);
    void fetchOpportunities(profileId, { useCache: false });
  };

  const refreshDecisions = useCallback(
    async (pid: string) => {
      try {
        const res = await fetch(
          `/api/match/decision?profileId=${encodeURIComponent(pid)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const json = (await res.json()) as { decisions?: EnrichedDecision[] };
        const decisions = json.decisions ?? [];
        setOpportunities((prev) => {
          if (prev.length === 0 && decisions.length === 0) return prev;
          const next = mergeDecisionsIntoOpportunities(prev, decisions);
          writeCache(pid, {
            profile: profile ?? ({ id: pid } as Profile),
            opportunities: next,
            note,
            warning,
          });
          return next;
        });
      } catch {
        /* ignore */
      }
    },
    [profile, note, warning]
  );

  useEffect(() => {
    if (!profileId || loading) return;

    void refreshDecisions(profileId);
    const timer = window.setInterval(() => {
      void refreshDecisions(profileId);
    }, DECISION_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshDecisions(profileId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [profileId, loading, refreshDecisions]);

  if (!profileId && !loading) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <MessageSquareQuote size={32} className="text-emerald-600 mx-auto mb-4" />
        <h1 className="text-2xl font-display font-bold text-slate-900 mb-3">Primero necesitas tu perfil</h1>
        <p className="text-slate-600 text-sm mb-8 leading-relaxed">
          Completa la entrevista para que podamos mostrarte empresas compatibles con tu potencial.
        </p>
        <Link href="/joven/chat">
          <Button size="lg" className="gap-2">
            Empezar entrevista <ArrowRight size={16} />
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <MatchPulseLoader
        label="Buscando oportunidades compatibles…"
        className="max-w-5xl mx-auto px-4 sm:px-6 min-h-[50vh]"
      />
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <AlertCircle className="text-rose-500 mx-auto mb-4" size={32} />
        <p className="text-slate-700 mb-6">{error}</p>
        <Link href={`/joven/perfil/${profileId}`}>
          <Button variant="outline">Volver a mi perfil</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 sm:space-y-10">
      {refreshing && (
        <MatchPulseLoader variant="overlay" label="Recalculando oportunidades…" />
      )}
      <header>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Conectar con empresas
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight">
          Así te ven las empresas en SaltoAI.
        </h1>
        {profile && (
          <p className="mt-4 text-slate-600 max-w-2xl leading-relaxed">
            <strong className="text-slate-900">{profile.name}</strong>, {profile.age} años
            {profile.gender && profile.gender !== 'prefiero_no_decir'
              ? ` · ${GENDER_LABEL[profile.gender]}`
              : ''}
            . Estas son las necesidades publicadas que más encajan con tu Perfil de Evidencia (ICS estimado).
          </p>
        )}
      </header>

      {note === 'no_needs' && (
        <section className="border-2 border-dashed border-slate-300 bg-slate-50 rounded-2xl p-10 text-center">
          <Building2 size={36} className="text-slate-400 mx-auto mb-4" />
          <h2 className="font-display font-semibold text-xl text-slate-900 mb-2">Aún no hay empresas publicadas</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6 leading-relaxed">
            Cuando un emprendimiento publique su necesidad, aparecerá aquí con tu % de compatibilidad. Mientras tanto, descarga tu CV ATS.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href={`/joven/perfil/${profileId}`}>
              <Button variant="outline">Mi perfil y CV</Button>
            </Link>
            <Link href="/empresa/chat">
              <Button variant="ghost" className="text-slate-600">
                ¿Conoces una empresa? Invítala
              </Button>
            </Link>
          </div>
        </section>
      )}

      {opportunities.length > 0 && (
        <section className="space-y-4">
          {opportunities.some((o) => o.companyStatus === 'interested') && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 text-sm text-emerald-900">
                <strong>
                  {opportunities.filter((o) => o.companyStatus === 'interested').length}
                </strong>{' '}
                empresa
                {opportunities.filter((o) => o.companyStatus === 'interested').length === 1
                  ? ' mostró interés'
                  : 's mostraron interés'}{' '}
                en tu perfil. Revisa las oportunidades marcadas abajo.
              </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">
              <Network size={14} className="text-emerald-500" />
              Oportunidades compatibles
              {fromCache && (
                <span className="text-[10px] text-slate-400 normal-case font-normal italic ml-1">
                  · resultados cacheados
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={forceRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-700 disabled:opacity-50"
              title="Recalcular ICS contra todas las necesidades"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Recalculando…' : 'Recalcular'}
            </button>
          </div>

          {warning && (
            <div className="flex items-start gap-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          )}

          {opportunities.map((opp, i) => {
            const isExpanded = expandedId === opp.needId;
            return (
              <article
                key={opp.needId}
                className={`bg-white border rounded-2xl p-4 sm:p-6 md:p-8 transition-all ${
                  opp.companyStatus === 'interested'
                    ? 'border-emerald-300 shadow-md shadow-emerald-100/50 ring-1 ring-emerald-200'
                    : i === 0
                      ? 'border-emerald-200 shadow-md shadow-emerald-100/40'
                      : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    {i === 0 && !opp.companyStatus && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-transparent mb-1">
                        <Sparkles size={12} className="mr-1" />
                        Mejor encaje
                      </Badge>
                    )}
                    {opp.companyStatus === 'interested' && (
                      <Badge className="bg-emerald-600 text-white border-transparent mb-1">
                        Empresa interesada en tu perfil
                      </Badge>
                    )}
                    {opp.companyStatus === 'discarded' && (
                      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 mb-1">
                        No avanzó en esta búsqueda
                      </Badge>
                    )}
                    <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900">{opp.companyName}</h2>
                    <p className="text-slate-700">{opp.role}</p>
                    <p className="text-sm text-slate-600 italic border-l-2 border-emerald-200 pl-3 mt-3">{opp.reason}</p>
                  </div>
                  <div className="flex items-baseline gap-1 md:text-right flex-shrink-0">
                    <span className="font-display font-bold text-4xl sm:text-5xl text-emerald-600 tabular-nums">{opp.ics}</span>
                    <span className="text-xl text-emerald-600 font-bold">%</span>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold ml-2 self-end pb-2">
                      ICS
                    </div>
                  </div>
                </div>

                {/* Desglose ICS — sustituye al link roto a /empresa/matches/[id]
                    (esa página requiere rol empresa). Acá el joven ve POR QUÉ
                    le dieron ese score, en su propia vista, sin atravesar el
                    RoleGate. */}
                {isExpanded && opp.breakdown && (
                  <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
                      Desglose del ICS
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <ScoreBar label="Habilidades técnicas" value={opp.breakdown.skillsFit} />
                      <ScoreBar label="Encaje conductual" value={opp.breakdown.behavioralFit} />
                      <ScoreBar label="Señal de aprendizaje" value={opp.breakdown.learningSignal} />
                      <ScoreBar label="Encaje con el contexto" value={opp.breakdown.contextFit} />
                    </div>
                    {opp.breakdown.penalties > 0 && (
                      <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        <strong>Penalización:</strong> −{opp.breakdown.penalties} pts por restricciones duras del rol.
                      </div>
                    )}
                    {opp.topSkills && opp.topSkills.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                          Tus skills más relevantes para este rol
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {opp.topSkills.map((s) => (
                            <Badge key={s} className="bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {opp.redFlag && opp.redFlag !== 'Ninguna señal negativa visible.' && (
                      <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <strong>A tener en cuenta:</strong> {opp.redFlag}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-3">
                  {(() => {
                    const alreadyConnected = connectedNeeds.has(opp.needId);
                    const isConnecting = connectingNeedId === opp.needId;
                    return (
                      <Button
                        className="gap-2"
                        disabled={alreadyConnected || isConnecting || !profileId}
                        onClick={() => {
                          // Doble track: el emit v3 sigue alimentando el
                          // dashboard de flywheel; handleConnect persiste la
                          // señal bidireccional joven_interest para que el
                          // founder lo vea como "match mutuo".
                          emit({
                            touchpoint: 'opportunity_click',
                            targetType: 'need',
                            targetId: opp.needId,
                            icsAtTime: opp.ics,
                          });
                          void handleConnect(opp.needId, opp.ics);
                        }}
                      >
                        {alreadyConnected ? (
                          <>
                            <CheckCircle2 size={14} /> Interés registrado
                          </>
                        ) : isConnecting ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Registrando…
                          </>
                        ) : (
                          'Quiero conectar'
                        )}
                      </Button>
                    );
                  })()}
                  {opp.breakdown ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        const expanding = !isExpanded;
                        setExpandedId(isExpanded ? null : opp.needId);
                        // "Ver desglose" también es señal de interés (curiosidad
                        // por el rol). La emitimos solo al expandir, no al
                        // colapsar — evita doble-emit por toggle.
                        if (expanding) {
                          emit({
                            touchpoint: 'opportunity_click',
                            targetType: 'need',
                            targetId: opp.needId,
                            icsAtTime: opp.ics,
                            text: 'breakdown_expanded',
                          });
                        }
                      }}
                    >
                      {isExpanded ? 'Ocultar desglose' : 'Ver desglose ICS'}
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="bg-slate-950 text-white rounded-2xl p-6 sm:p-8 text-center">
        <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
          El ICS es una señal de priorización, no un veredicto. Cuando una empresa te contacte, sabrás por qué encajaste — algo que LinkedIn casi nunca te dice.
        </p>
        <Link href={`/joven/perfil/${profileId}`} className="inline-block mt-6">
          <Button variant="outline" className="bg-transparent border-slate-600 text-white hover:bg-slate-800">
            Volver a mi perfil
          </Button>
        </Link>
      </section>
    </div>
  );
}

/**
 * Barra de score 0-100 con label y número. Sirve al desglose ICS del joven
 * en cada opportunity card. Verde si >= 60, amarillo si 40-59, rosa si < 40.
 */
function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const tone =
    clamped >= 60
      ? { bar: 'bg-emerald-500', text: 'text-emerald-700' }
      : clamped >= 40
        ? { bar: 'bg-amber-500', text: 'text-amber-700' }
        : { bar: 'bg-rose-500', text: 'text-rose-700' };
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-slate-600">{label}</span>
        <span className={`text-sm font-display font-bold tabular-nums ${tone.text}`}>
          {clamped}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${tone.bar} transition-all`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export default function ConectarPage() {
  // RoleGate envuelve afuera del Suspense — las oportunidades del joven son
  // privadas a él (el founder ve sus matches en /empresa/matches/{needId},
  // no aquí). Antes el gate vivía en el layout, ahora vive per-page.
  return (
    <RoleGate role="joven">
      <Suspense
        fallback={
          <div className="max-w-4xl mx-auto px-6 py-24 text-center text-slate-500 text-sm">
            Cargando…
          </div>
        }
      >
        <ConectarContent />
      </Suspense>
    </RoleGate>
  );
}
