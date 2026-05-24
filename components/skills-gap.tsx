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

import { useEffect, useMemo, useState } from 'react';
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
  Sparkles,
  TrendingUp,
} from 'lucide-react';

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

export function SkillsGap({ profileId }: { profileId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aggregated, setAggregated] = useState<AggregatedGap[]>([]);
  const [coverageAvg, setCoverageAvg] = useState<number>(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [coursesBySkill, setCoursesBySkill] = useState<Record<string, CoursesResponse | 'loading' | 'error'>>({});

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
        setAggregated((json.aggregated as AggregatedGap[]) ?? []);
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

  const loadCoursesFor = async (skill: string) => {
    if (coursesBySkill[skill] && coursesBySkill[skill] !== 'error') return;
    setCoursesBySkill((prev) => ({ ...prev, [skill]: 'loading' }));
    try {
      const res = await fetch(`/api/cursos/recomendar?skill=${encodeURIComponent(skill)}`);
      const json = (await res.json()) as CoursesResponse;
      if (!res.ok || !json.courses) {
        setCoursesBySkill((prev) => ({ ...prev, [skill]: 'error' }));
        return;
      }
      setCoursesBySkill((prev) => ({ ...prev, [skill]: json }));
    } catch {
      setCoursesBySkill((prev) => ({ ...prev, [skill]: 'error' }));
    }
  };

  const toggleSkill = (skill: string) => {
    const next = expanded === skill ? null : skill;
    setExpanded(next);
    if (next) void loadCoursesFor(next);
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
          const isExpanded = expanded === gap.skill;
          const courses = coursesBySkill[gap.skill];
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
                            ? 'bg-amber-100 text-amber-900 border-transparent text-[10px]'
                            : 'bg-slate-100 text-slate-700 border-transparent text-[10px]'
                      }
                    >
                      <TrendingUp size={10} className="mr-1" />
                      Prioridad {priority}/5
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 text-slate-600 text-[10px]">
                      Pedida por {gap.demandedBy} {gap.demandedBy === 1 ? 'empresa' : 'empresas'}
                    </Badge>
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
                    <div className="space-y-2">
                      {[0, 1].map((i) => (
                        <div key={i} className="h-20 bg-white border border-slate-100 rounded-lg animate-pulse" />
                      ))}
                      <p className="text-[11px] text-slate-500 italic mt-2">
                        Buscando cursos verificables con Google…
                      </p>
                    </div>
                  )}

                  {isErrorCourses && (
                    <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      No pudimos buscar cursos en este momento. Reintenta cerrando y abriendo esta sección.
                    </div>
                  )}

                  {courseData && courseData.courses.length === 0 && (
                    <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {courseData.warning || 'No encontramos cursos gratuitos verificables. Probá buscar manualmente en Platzi o YouTube.'}
                    </div>
                  )}

                  {courseData && courseData.courses.length > 0 && (
                    <div className="space-y-2.5">
                      {courseData.courses.map((c, i) => (
                        <a
                          key={i}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-sm transition-all rounded-lg p-3.5"
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
                                    <span className="text-amber-700">EN con subs ES</span>
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
                      ))}
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
