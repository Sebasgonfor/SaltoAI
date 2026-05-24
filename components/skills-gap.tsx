'use client';

/**
 * Sección "Tus brechas + cursos gratuitos" en el perfil del joven.
 *
 * Llama a /api/perfil/gaps (modo aggregate) para obtener las skills más
 * pedidas por las necesidades del shortlist que el joven NO tiene. Por
 * cada skill faltante, ofrece un botón "Ver cursos" que dispara
 * /api/cursos/recomendar (Gemini grounded → cursos reales).
 *
 * Diseño UX:
 *   - Una sola sección colapsada si no hay skills faltantes ("Tu perfil
 *     ya cubre las necesidades top — bien").
 *   - Si las hay, una lista priorizada (top 5) con expand-on-click por
 *     curso.
 *   - Loading state honesto: skeletons + texto del status real ("buscando
 *     cursos gratuitos…").
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GraduationCap,
  Loader2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { FeedbackThumbs } from '@/components/feedback/thumbs';
import { useEmitSignal } from '@/hooks/use-emit-signal';

interface AggregatedGap {
  skill: string;
  demandedBy: number;
  avgPriority: number;
  topNeedExample: string;
  topSuggestion: string;
}

interface CourseRecommendation {
  title: string;
  provider: string;
  url: string;
  language: string;
  estimatedHours: number;
  why: string;
}

interface CoursesResponse {
  skill: string;
  courses: CourseRecommendation[];
  cached?: boolean;
  warning?: string;
}

/**
 * Normaliza una skill para detectar duplicados semánticos básicos. Antes
 * teníamos "TikTok" y "Manejo de TikTok" como entradas separadas — son
 * la misma skill desde la perspectiva del joven. Eliminamos prefijos
 * comunes ("manejo de", "gestión de", "uso de") + acentos + minúsculas.
 *
 * Ojo: el matching semántico fuerte se hace en el LLM. Esto es dedup
 * de bajo costo en el cliente. Sirve para los casos obvios ("TikTok" vs
 * "Manejo de TikTok"); para casos sutiles (sinónimos en español) lo
 * ideal sería pasar las skills agregadas por Gemini con responseSchema
 * y que las agrupe semánticamente — eso vendrá en otro commit.
 */
function normalizeSkillKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/^(manejo|gesti[óo]n|uso|conocimiento|dominio)\s+(de|del|en)\s+/i, '')
    .replace(/^(b[áa]sico|avanzado|intermedio)\s+(de|en)\s+/i, '')
    .replace(/\s+(b[áa]sico|avanzado|intermedio)$/i, '')
    .replace(/[^a-z0-9\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dedup de gaps por la normalización de skill. Cuando dos entradas
 * colapsan, sumamos la demanda y promediamos la prioridad. Conservamos
 * el nombre original más corto (suele ser el "canónico" — "TikTok"
 * gana sobre "Manejo de TikTok").
 */
function dedupGaps(gaps: AggregatedGap[]): AggregatedGap[] {
  const map = new Map<string, AggregatedGap>();
  for (const g of gaps) {
    const key = normalizeSkillKey(g.skill);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...g });
      continue;
    }
    // Merge: sumamos demanda, promedio ponderado de prioridad.
    const total = prev.demandedBy + g.demandedBy;
    prev.avgPriority =
      (prev.avgPriority * prev.demandedBy + g.avgPriority * g.demandedBy) / total;
    prev.demandedBy = total;
    // Conservamos el nombre más corto (más canónico).
    if (g.skill.length < prev.skill.length) {
      prev.skill = g.skill;
      prev.topSuggestion = g.topSuggestion;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.demandedBy * b.avgPriority - a.demandedBy * a.avgPriority,
  );
}

// Cache de cursos en localStorage por perfil. Sobrevive a navegación.
// TTL 7 días — los cursos cambian poco en ese plazo y queremos evitar
// hammering al endpoint con grounding (gasta cuota de Gemini).
const COURSES_CACHE_KEY = (profileId: string) => `salto.courses.${profileId}`;
const COURSES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedCoursesEntry {
  data: CoursesResponse;
  timestamp: number;
}

function readCoursesCache(profileId: string): Record<string, CachedCoursesEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(COURSES_CACHE_KEY(profileId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CachedCoursesEntry>;
  } catch {
    return {};
  }
}

function writeCoursesCache(profileId: string, all: Record<string, CachedCoursesEntry>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COURSES_CACHE_KEY(profileId), JSON.stringify(all));
  } catch {
    /* quota — ignoramos */
  }
}

export function SkillsGap({ profileId }: { profileId: string }) {
  const emit = useEmitSignal();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aggregated, setAggregated] = useState<AggregatedGap[]>([]);
  const [coverageAvg, setCoverageAvg] = useState<number>(0);
  // expanded ahora es un Set — el usuario puede tener varias cards abiertas
  // a la vez sin que abrir una cierre la otra.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [coursesBySkill, setCoursesBySkill] = useState<Record<string, CoursesResponse | 'loading' | 'error'>>({});
  // Tracking de qué skills ya disparamos al endpoint. Evita re-llamadas
  // duplicadas cuando el componente se re-renderiza durante el pre-fetch.
  const inFlightRef = useRef<Set<string>>(new Set());

  // 1. Cargar gaps al montar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/perfil/gaps?profileId=${encodeURIComponent(profileId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || 'No pudimos calcular tus brechas.');
          return;
        }
        const gaps: { coveragePct: number }[] = json.gaps ?? [];
        if (gaps.length > 0) {
          const avg = Math.round(
            gaps.reduce((acc, g) => acc + g.coveragePct, 0) / gaps.length,
          );
          setCoverageAvg(avg);
        }
        const raw = (json.aggregated as AggregatedGap[]) ?? [];
        setAggregated(dedupGaps(raw));
      } catch {
        if (!cancelled) setError('Error de red.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const topGaps = useMemo(() => aggregated.slice(0, 5), [aggregated]);

  // Función estable de carga (lee cache primero, después red, después persiste).
  const loadCoursesFor = async (skill: string) => {
    // Si ya tenemos data buena (o está corriendo), no hagas nada.
    const current = coursesBySkill[skill];
    if (current && current !== 'error' && current !== 'loading') return;
    if (inFlightRef.current.has(skill)) return;
    inFlightRef.current.add(skill);

    // Lee cache de localStorage primero.
    const cache = readCoursesCache(profileId);
    const cached = cache[skill];
    if (cached && Date.now() - cached.timestamp < COURSES_CACHE_TTL_MS) {
      setCoursesBySkill((prev) => ({ ...prev, [skill]: cached.data }));
      inFlightRef.current.delete(skill);
      return;
    }

    setCoursesBySkill((prev) => ({ ...prev, [skill]: 'loading' }));
    try {
      const res = await fetch(`/api/cursos/recomendar?skill=${encodeURIComponent(skill)}`);
      const json = (await res.json()) as CoursesResponse;
      if (!res.ok || !Array.isArray(json.courses)) {
        setCoursesBySkill((prev) => ({ ...prev, [skill]: 'error' }));
        return;
      }
      setCoursesBySkill((prev) => ({ ...prev, [skill]: json }));
      // Persistimos en localStorage SOLO si trajo al menos un curso.
      if (json.courses.length > 0) {
        const updated = { ...cache, [skill]: { data: json, timestamp: Date.now() } };
        writeCoursesCache(profileId, updated);
      }
    } catch {
      setCoursesBySkill((prev) => ({ ...prev, [skill]: 'error' }));
    } finally {
      inFlightRef.current.delete(skill);
    }
  };

  // 2. Pre-fetch paralelo: cuando los topGaps cambian, disparamos la búsqueda
  // de cursos para TODAS las skills en background. Cuando el usuario expanda
  // cualquier card, los datos ya están listos (o casi). Limitamos la
  // concurrencia a 3 para no saturar el rate limit de Gemini.
  useEffect(() => {
    if (topGaps.length === 0) return;
    let cancelled = false;
    (async () => {
      const queue = [...topGaps];
      const workers = Array.from({ length: 3 }, async () => {
        while (!cancelled && queue.length > 0) {
          const g = queue.shift();
          if (!g) break;
          await loadCoursesFor(g.skill);
        }
      });
      await Promise.all(workers);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topGaps]);

  const toggleSkill = (skill: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
        // Por si el pre-fetch no llegó todavía, garantizamos que esta skill
        // entra a la queue de carga.
        void loadCoursesFor(skill);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Tu plan de crecimiento
        </div>
        <div className="h-7 w-3/5 bg-slate-200 rounded animate-pulse mb-3" />
        <div className="h-4 w-4/5 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-slate-50 border border-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-rose-50/40 border border-rose-200/60 rounded-2xl p-5 flex items-start gap-3">
        <AlertCircle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-rose-900">No pudimos calcular tus brechas</div>
          <div className="text-xs text-rose-700 mt-1">{error}</div>
        </div>
      </section>
    );
  }

  // Si no hay agregados, dos casos: (a) no hay needs publicadas todavía, o
  // (b) el perfil ya cubre todo. Lo distinguimos por coverageAvg.
  if (topGaps.length === 0) {
    return (
      <section className="bg-emerald-50/40 border border-emerald-200/60 rounded-3xl p-6 md:p-8 flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={22} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
            Sin brechas detectadas
          </div>
          <h3 className="font-display font-bold text-xl text-slate-900 mb-1">
            {coverageAvg > 0
              ? '¡Tu perfil cubre lo que el mercado pide!'
              : 'Aún no hay necesidades publicadas para comparar.'}
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            {coverageAvg > 0
              ? 'Las skills de las empresas activas ya están cubiertas por tu perfil. Sigue añadiendo evidencia con cada microtask que completes.'
              : 'Cuando una empresa publique una necesidad y veas que te pide algo que no tienes, te lo mostramos acá con cursos gratuitos para aprenderlo.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
            Tu plan de crecimiento
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-slate-900 tracking-tight leading-tight">
            Skills que el mercado pide y aún no tienes.
          </h2>
          <p className="text-sm text-slate-600 mt-2 max-w-xl leading-relaxed">
            Comparamos tu perfil contra las {topGaps.length === 5 ? 'top 5' : 'principales'} necesidades publicadas que más encajan
            contigo. Cubrir estas brechas sube tu ICS para esas empresas.
          </p>
        </div>
        {coverageAvg > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center flex-shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
              Cobertura promedio
            </div>
            <div className="font-display font-bold text-2xl text-emerald-700 tabular-nums">
              {coverageAvg}%
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {topGaps.map((gap) => {
          const isExpanded = expanded.has(gap.skill);
          const courses = coursesBySkill[gap.skill];
          const hasCoursesReady = courses && courses !== 'loading' && courses !== 'error';
          const isLoadingCourses = courses === 'loading';
          const isErrorCourses = courses === 'error';
          const courseData = courses && courses !== 'loading' && courses !== 'error' ? courses : null;
          const priority = Math.round(gap.avgPriority);
          return (
            <div
              key={gap.skill}
              className="border border-slate-200 rounded-xl overflow-hidden hover:border-emerald-200 transition-colors"
            >
              <button
                type="button"
                onClick={() => toggleSkill(gap.skill)}
                className="w-full text-left px-4 py-4 hover:bg-slate-50/50 transition-colors flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h3 className="font-display font-semibold text-base text-slate-900">
                      {gap.skill}
                    </h3>
                    <Badge
                      variant="secondary"
                      className={
                        priority >= 4
                          ? 'bg-rose-100 text-rose-800 border-transparent text-[10px]'
                          : priority >= 3
                            ? 'bg-emerald-100 text-emerald-900 border-transparent text-[10px]'
                            : 'bg-slate-100 text-slate-700 border-transparent text-[10px]'
                      }
                    >
                      <TrendingUp size={10} className="mr-1" />
                      Prioridad {priority}/5
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 text-slate-600 text-[10px]">
                      Pedida por {gap.demandedBy} {gap.demandedBy === 1 ? 'empresa' : 'empresas'}
                    </Badge>
                    {/* Indicador discreto de pre-fetch listo. Si los cursos
                        ya están en cache/memoria, mostramos un checkmark
                        para que el usuario sepa que la card va a abrir
                        instantáneamente. Si está cargando en background,
                        un spinner pequeño. */}
                    {courses === 'loading' && (
                      <Loader2 size={11} className="text-slate-400 animate-spin" aria-label="Buscando cursos" />
                    )}
                    {hasCoursesReady && courses.courses.length > 0 && !isExpanded && (
                      <span className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5">
                        <CheckCircle2 size={9} /> {courses.courses.length} cursos listos
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{gap.topSuggestion}</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">Ej: {gap.topNeedExample}</p>
                </div>
                <div className="flex-shrink-0">
                  {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/30">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-3 flex items-center gap-1.5">
                    <Sparkles size={12} /> Cursos gratuitos recomendados
                  </div>

                  {isLoadingCourses && (
                    <div className="space-y-2.5">
                      {[0, 1].map((i) => (
                        // Skeleton más rico: estructura igual al card real para
                        // que el reemplazo no haga "flash". Animación staggered.
                        <div
                          key={i}
                          className="bg-white border border-slate-200 rounded-lg p-3.5"
                          style={{ animationDelay: `${i * 0.1}s` }}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-3/4 bg-slate-200 rounded animate-pulse" />
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
                                <div className="h-3 w-12 bg-slate-100 rounded animate-pulse" />
                              </div>
                            </div>
                            <div className="h-3 w-3 bg-slate-100 rounded animate-pulse mt-1" />
                          </div>
                          <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                          <div className="h-3 w-4/5 bg-slate-100 rounded animate-pulse mt-1.5" />
                        </div>
                      ))}
                      <p className="text-[11px] text-slate-500 italic flex items-center gap-1.5">
                        <Loader2 size={10} className="animate-spin" /> Buscando cursos verificables con Google…
                      </p>
                    </div>
                  )}

                  {isErrorCourses && (
                    <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      No pudimos buscar cursos en este momento. Reintenta cerrando y abriendo esta sección.
                    </div>
                  )}

                  {courseData && courseData.courses.length === 0 && (
                    <div className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      {courseData.warning || 'No encontramos cursos gratuitos verificables. Probá buscar manualmente en Platzi o YouTube.'}
                    </div>
                  )}

                  {courseData && courseData.courses.length > 0 && (
                    <div className="space-y-2.5">
                      {courseData.courses.map((c, i) => {
                        // targetId estable por (profile, skill, índice) para
                        // que el dedup de localStorage funcione bien y un
                        // user no pueda votar dos veces el mismo curso.
                        const courseTargetId = `${profileId}__${gap.skill}__${i}`;
                        return (
                          <div
                            key={i}
                            className="block bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-sm transition-all rounded-lg p-3.5"
                          >
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => {
                                // Implícita: el user abrió el curso. Es señal
                                // fuerte de relevancia (más fuerte que el
                                // thumb de abajo que pocos cliquean).
                                emit({
                                  touchpoint: 'course_recommendation',
                                  targetType: 'suggestion',
                                  targetId: courseTargetId,
                                  text: c.title,
                                });
                              }}
                              className="block"
                            >
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm text-slate-900 leading-snug">{c.title}</div>
                                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                    <BookOpen size={11} />
                                    <span>{c.provider}</span>
                                    {c.estimatedHours > 0 && (
                                      <>
                                        <span>·</span>
                                        <span>~{c.estimatedHours}h</span>
                                      </>
                                    )}
                                    {c.language === 'en-with-es-subs' && (
                                      <>
                                        <span>·</span>
                                        <span className="text-emerald-700">EN con subs ES</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <ExternalLink size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                              </div>
                              {c.why && (
                                <p className="text-xs text-slate-600 leading-relaxed mt-1">{c.why}</p>
                              )}
                            </a>
                            {/* Thumb explícito sobre la calidad de la
                                recomendación. Silencioso: no muestra "Gracias"
                                inline para no romper el ritmo visual del
                                listado. */}
                            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-end">
                              <FeedbackThumbs
                                label="¿Buena recomendación?"
                                thanksText="Gracias."
                                layout="inline"
                                silent
                                touchpoint="course_recommendation"
                                targetType="suggestion"
                                targetId={courseTargetId}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {courseData.cached && (
                        <p className="text-[10px] text-slate-400 italic">Resultados cacheados — actualizados las últimas 24h.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-5 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
        <GraduationCap size={14} className="flex-shrink-0 mt-0.5 text-emerald-600" />
        <p className="leading-relaxed">
          Cuando completes un curso, súbelo como certificado en tu perfil. SaltoAI lee el documento, extrae las habilidades verificadas y se las muestra a las empresas.
        </p>
      </div>
    </section>
  );
}

export default SkillsGap;
