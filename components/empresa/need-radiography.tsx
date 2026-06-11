'use client';

/**
 * Radiografía de la necesidad publicada — dashboard rico para `/empresa/matches/[needId]`.
 *
 * Convierte la página de matches de "lista de candidatos" en una vista
 * de inteligencia operativa con widgets:
 *
 *   1. KPIs de un vistazo (ICS promedio, # candidatos, días desde publicación,
 *      cobertura de skills).
 *   2. Salud de la necesidad — heurística client-side que detecta señales de
 *      mal-spec (contexto corto, pocas skills, restricciones imposibles) y
 *      sugiere arreglos.
 *   3. Histograma de ICS del shortlist — distribución de calidad del pool.
 *   4. Dimensiones ICS promedio — qué dimensión tira para abajo.
 *   5. Cobertura de skills — qué pide la necesidad vs. qué tiene el shortlist.
 *   6. Perfil de la empresa — legal, founder, otras needs publicadas.
 *   7. Engagement — clicks, microtasks propuestas, votos útiles. Lee del
 *      feedback flywheel (§8.6).
 *
 * Datos:
 *   - `need`     y `matches` ya vienen del fetch principal de la página.
 *   - `companyProfile` y `engagement` se cargan de /api/empresa/radiography.
 *
 * Defensa: si el endpoint falla, el componente sigue renderizando con los
 * widgets que dependen solo de `need` + `matches` (la mayoría).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  TrendingUp,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Mail,
  Users,
  Layers,
  Target,
  HeartPulse,
  Eye,
  Briefcase,
  ChevronRight,
  Star,
  ThumbsDown,
} from 'lucide-react';
import type { CompanyNeed, Match } from '@/lib/types';

// ─── Tipos para la respuesta del endpoint ────────────────────────────────────

interface OtherNeed {
  id: string;
  role: string;
  createdAt: number;
  status: 'active' | 'older';
}

interface CompanyProfile {
  legal: CompanyNeed['legal'] | null;
  ownerName: string | null;
  ownerEmail: string | null;
  totalNeeds: number;
  otherNeeds: OtherNeed[];
  isFirstNeed: boolean;
}

interface Engagement {
  profileClicks: number;
  microtaskProposals: number;
  matchUsefulCount: number;
  matchNotUsefulCount: number;
  passReasons: number;
  totalSignals: number;
  lastActivityAt: number | null;
  topProfileIds: { profileId: string; clicks: number }[];
}

interface RadiographyData {
  need: CompanyNeed;
  companyProfile: CompanyProfile;
  engagement: Engagement;
}

// ─── Helpers de cálculo ──────────────────────────────────────────────────────

function daysAgo(ts: number): number {
  return Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24)));
}

function formatAgo(ts?: number | null): string {
  if (!ts) return 'sin actividad';
  const d = daysAgo(ts);
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return `hace ${m} ${m === 1 ? 'mes' : 'meses'}`;
}

/**
 * Cobertura de skills: % de `requiredSkills` que aparece en los topSkills
 * de al menos un match del shortlist. Lectura honesta: si pides "SQL" y
 * nadie del shortlist lo tiene, esto baja.
 */
function computeSkillCoverage(
  need: CompanyNeed,
  matches: Match[],
): { covered: string[]; missing: string[]; coveragePct: number } {
  const norm = (s: string) => s.toLowerCase().trim();
  const supply = new Set<string>();
  for (const m of matches) {
    for (const s of m.topSkills ?? []) supply.add(norm(s));
    for (const v of m.verifiedSkills ?? []) supply.add(norm(v.skill));
  }
  const covered: string[] = [];
  const missing: string[] = [];
  for (const req of need.requiredSkills) {
    const ok = Array.from(supply).some(
      (s) => s.includes(norm(req)) || norm(req).includes(s),
    );
    if (ok) covered.push(req);
    else missing.push(req);
  }
  const total = need.requiredSkills.length || 1;
  return {
    covered,
    missing,
    coveragePct: Math.round((covered.length / total) * 100),
  };
}

interface HealthCheck {
  score: number; // 0-100
  issues: { severity: 'high' | 'medium' | 'low'; text: string }[];
}

/**
 * Heurística de "salud" de la necesidad publicada. Lo importante NO es la
 * nota: son las recomendaciones accionables. Si la nota está baja, abajo
 * dice POR QUÉ.
 */
function computeHealth(need: CompanyNeed, matches: Match[]): HealthCheck {
  const issues: HealthCheck['issues'] = [];
  let score = 100;

  // Contexto operativo demasiado corto = el ICS pierde precisión.
  if ((need.context?.trim().length ?? 0) < 80) {
    issues.push({
      severity: 'high',
      text: 'El contexto operativo es muy corto. Ampliarlo a 2-3 frases sube la precisión del matching.',
    });
    score -= 25;
  }
  // Sin skills declaradas = matching ciego.
  if (need.requiredSkills.length === 0) {
    issues.push({
      severity: 'high',
      text: 'No declaraste skills requeridos. El motor está usando solo el contexto y los rasgos.',
    });
    score -= 30;
  } else if (need.requiredSkills.length < 3) {
    issues.push({
      severity: 'medium',
      text: 'Tenés muy pocas skills declaradas. Agregar 2-3 más afina los matches.',
    });
    score -= 10;
  }
  // Restricciones demasiado duras: si todos los matches tienen penalización > 30, las hardConstraints están filtrando demasiado.
  if (matches.length > 0) {
    const avgPenalty =
      matches.reduce((a, m) => a + (m.breakdown?.penalties ?? 0), 0) /
      matches.length;
    if (avgPenalty > 30 && need.hardConstraints.length > 0) {
      issues.push({
        severity: 'medium',
        text: `Penalización promedio alta (${Math.round(avgPenalty)}). Las restricciones duras están filtrando candidatos buenos — reconsiderá cuáles son críticas.`,
      });
      score -= 15;
    }
  }
  // ICS pool bajo = el motor encuentra match pero la calidad real es baja.
  if (matches.length > 0) {
    const avgIcs = matches.reduce((a, m) => a + m.ics, 0) / matches.length;
    if (avgIcs < 50) {
      issues.push({
        severity: 'low',
        text: `ICS promedio bajo (${Math.round(avgIcs)}). El pool aún no encaja bien — esperá más perfiles o relajá requisitos.`,
      });
      score -= 10;
    }
  } else {
    issues.push({
      severity: 'high',
      text: 'Sin candidatos en el shortlist todavía. Esperá a que más jóvenes completen la entrevista.',
    });
    score -= 20;
  }
  // Rasgos deseados: ¿faltan?
  if (need.desiredTraits.length === 0) {
    issues.push({
      severity: 'low',
      text: 'No declaraste rasgos deseados (autonomía, comunicación, etc.). El match conductual será más débil.',
    });
    score -= 5;
  }

  return { score: Math.max(0, score), issues };
}

// ─── Componente principal ───────────────────────────────────────────────────

interface Props {
  need: CompanyNeed;
  matches: Match[];
  needId: string;
}

export function NeedRadiography({ need, matches, needId }: Props) {
  const [data, setData] = useState<RadiographyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/empresa/radiography?needId=${encodeURIComponent(needId)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as RadiographyData;
        if (!cancelled) setData(json);
      } catch {
        /* silencioso: los widgets que dependen solo de need+matches igual renderizan */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needId]);

  // Métricas derivadas de need + matches (no requieren endpoint).
  const metrics = useMemo(() => {
    const avgIcs =
      matches.length === 0
        ? 0
        : Math.round(matches.reduce((a, m) => a + m.ics, 0) / matches.length);
    const coverage = computeSkillCoverage(need, matches);
    const health = computeHealth(need, matches);
    const days = daysAgo(need.createdAt);

    // Dimensiones ICS promedio.
    const dims = {
      skillsFit: 0,
      behavioralFit: 0,
      learningSignal: 0,
      contextFit: 0,
      penalties: 0,
    };
    if (matches.length > 0) {
      for (const m of matches) {
        dims.skillsFit += m.breakdown?.skillsFit ?? 0;
        dims.behavioralFit += m.breakdown?.behavioralFit ?? 0;
        dims.learningSignal += m.breakdown?.learningSignal ?? 0;
        dims.contextFit += m.breakdown?.contextFit ?? 0;
        dims.penalties += m.breakdown?.penalties ?? 0;
      }
      const n = matches.length;
      dims.skillsFit = Math.round(dims.skillsFit / n);
      dims.behavioralFit = Math.round(dims.behavioralFit / n);
      dims.learningSignal = Math.round(dims.learningSignal / n);
      dims.contextFit = Math.round(dims.contextFit / n);
      dims.penalties = Math.round(dims.penalties / n);
    }

    // Histograma: buckets de 20.
    const buckets = [0, 0, 0, 0, 0];
    for (const m of matches) {
      const idx = Math.min(4, Math.floor(m.ics / 20));
      buckets[idx]++;
    }

    return { avgIcs, coverage, health, days, dims, buckets };
  }, [need, matches]);

  return (
    <section className="space-y-6" aria-label="Radiografía de la necesidad">
      {/* ─── KPI strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<TrendingUp size={14} />}
          label="ICS promedio"
          value={metrics.avgIcs.toString()}
          unit="%"
          tone={
            metrics.avgIcs >= 70
              ? 'good'
              : metrics.avgIcs >= 50
                ? 'warn'
                : 'bad'
          }
          hint={`shortlist de ${matches.length}`}
        />
        <KpiCard
          icon={<Users size={14} />}
          label="Candidatos"
          value={matches.length.toString()}
          hint={
            matches.length === 0
              ? 'sin shortlist aún'
              : matches.length === 1
                ? '1 perfil rankeado'
                : `top ${matches.length} rankeados`
          }
        />
        <KpiCard
          icon={<Clock size={14} />}
          label="Publicada"
          value={metrics.days === 0 ? 'hoy' : `${metrics.days}d`}
          hint={formatAgo(need.createdAt)}
        />
        <KpiCard
          icon={<Target size={14} />}
          label="Skills cubiertas"
          value={`${metrics.coverage.coveragePct}`}
          unit="%"
          tone={
            metrics.coverage.coveragePct >= 70
              ? 'good'
              : metrics.coverage.coveragePct >= 40
                ? 'warn'
                : 'bad'
          }
          hint={`${metrics.coverage.covered.length} de ${need.requiredSkills.length}`}
        />
      </div>

      {/* ─── Salud + Histograma ──────────────────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-5">
        <HealthWidget health={metrics.health} className="lg:col-span-3" />
        <HistogramWidget
          buckets={metrics.buckets}
          total={matches.length}
          className="lg:col-span-2"
        />
      </div>

      {/* ─── Dimensiones promedio ────────────────────────────────────── */}
      {matches.length > 0 && (
        <DimensionsWidget dims={metrics.dims} />
      )}

      {/* ─── Skills coverage detalle ─────────────────────────────────── */}
      <SkillsCoverageWidget coverage={metrics.coverage} />

      {/* ─── Empresa + Engagement (depende del endpoint) ─────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <CompanyProfileWidget
          loading={loading}
          companyProfile={data?.companyProfile ?? null}
          need={need}
        />
        <EngagementWidget
          loading={loading}
          engagement={data?.engagement ?? null}
        />
      </div>
    </section>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const valueColor =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'bad'
          ? 'text-rose-600'
          : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
        <span className="text-emerald-600">{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`font-display font-bold text-2xl md:text-3xl tabular-nums leading-none ${valueColor}`}>
        {value}
        {unit && <span className="text-base font-semibold ml-0.5">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-slate-500 mt-1.5 truncate">{hint}</div>}
    </div>
  );
}

// ─── HealthWidget ────────────────────────────────────────────────────────────

function HealthWidget({
  health,
  className = '',
}: {
  health: HealthCheck;
  className?: string;
}) {
  const tone =
    health.score >= 80
      ? { bg: 'bg-emerald-50/40 border-emerald-200/60', text: 'text-emerald-700', label: 'Saludable' }
      : health.score >= 50
        ? { bg: 'bg-amber-50/40 border-amber-200/60', text: 'text-amber-700', label: 'Mejorable' }
        : { bg: 'bg-rose-50/40 border-rose-200/60', text: 'text-rose-700', label: 'Necesita ajustes' };

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-5 md:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
            <HeartPulse size={12} className="text-emerald-600" />
            Salud de tu necesidad
          </div>
          <h3 className="font-display font-semibold text-lg text-slate-900">
            ¿Está bien definida para que el motor acierte?
          </h3>
        </div>
        <div className={`flex flex-col items-end ${tone.text}`}>
          <div className="font-display font-bold text-3xl tabular-nums leading-none">
            {health.score}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-semibold mt-1">
            {tone.label}
          </div>
        </div>
      </div>

      {health.issues.length === 0 ? (
        <div className={`flex items-start gap-2.5 ${tone.bg} border rounded-xl px-3 py-3`}>
          <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700 leading-relaxed">
            Tu necesidad está bien definida. El motor tiene contexto, skills y
            rasgos suficientes para rankear con precisión.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {health.issues.map((issue, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50"
            >
              <span
                className={`flex-shrink-0 mt-0.5 ${
                  issue.severity === 'high'
                    ? 'text-rose-600'
                    : issue.severity === 'medium'
                      ? 'text-amber-600'
                      : 'text-slate-500'
                }`}
              >
                <AlertTriangle size={14} />
              </span>
              <span className="text-sm text-slate-700 leading-relaxed">{issue.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── HistogramWidget ─────────────────────────────────────────────────────────

function HistogramWidget({
  buckets,
  total,
  className = '',
}: {
  buckets: number[];
  total: number;
  className?: string;
}) {
  const labels = ['0–20', '20–40', '40–60', '60–80', '80–100'];
  const max = Math.max(1, ...buckets);
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-5 md:p-6 ${className}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <Layers size={12} className="text-emerald-600" />
        Distribución ICS
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-5">
        ¿Cómo se ve la calidad del pool?
      </h3>
      {total === 0 ? (
        <p className="text-sm text-slate-500 leading-relaxed">
          Sin candidatos para distribuir. Vuelve cuando haya shortlist.
        </p>
      ) : (
        <>
          <div className="flex items-stretch gap-2 sm:gap-3 h-40">
            {buckets.map((count, i) => {
              const pct = (count / max) * 100;
              const tone =
                i >= 3 ? 'bg-emerald-500' : i === 2 ? 'bg-amber-400' : 'bg-slate-300';
              // Alto mínimo visible cuando hay al menos 1 candidato.
              const barH = count > 0 ? Math.max(pct, 8) : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center min-w-0 h-full">
                  {/* zona de barra: ocupa todo el alto; la barra crece desde abajo */}
                  <div className="relative w-full flex-1 rounded-md bg-slate-50/80">
                    {count > 0 && (
                      <div
                        className={`absolute inset-x-0 bottom-0 ${tone} rounded-md transition-[height] duration-500`}
                        style={{ height: `${barH}%` }}
                      />
                    )}
                    <span
                      className={`absolute inset-x-0 text-center text-[11px] tabular-nums font-semibold ${
                        count > 0 ? 'text-slate-700' : 'text-slate-300'
                      }`}
                      style={count > 0 ? { bottom: `calc(${barH}% + 3px)` } : { bottom: '3px' }}
                    >
                      {count}
                    </span>
                  </div>
                  <span className="mt-2 text-[10px] text-slate-500 font-medium">
                    {labels[i]}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
            Cantidad de candidatos del shortlist por rango de{' '}
            <strong className="text-slate-700 font-semibold">compatibilidad (ICS)</strong>, de 0 a
            100. Cuanto más a la derecha, mejor el encaje con tu necesidad.
          </p>
        </>
      )}
    </div>
  );
}

// ─── DimensionsWidget ────────────────────────────────────────────────────────

function DimensionsWidget({
  dims,
}: {
  dims: {
    skillsFit: number;
    behavioralFit: number;
    learningSignal: number;
    contextFit: number;
    penalties: number;
  };
}) {
  const rows: { key: keyof typeof dims; label: string; help: string }[] = [
    { key: 'skillsFit', label: 'Skills', help: 'Cobertura técnica del shortlist' },
    { key: 'behavioralFit', label: 'Conducta', help: 'Compatibilidad de rasgos' },
    { key: 'learningSignal', label: 'Aprendizaje', help: 'Señales de autodidactismo' },
    { key: 'contextFit', label: 'Contexto', help: 'Encaje con caos/ritmo' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <Sparkles size={12} className="text-emerald-600" />
        Dimensiones promedio
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">
        Dónde brilla el pool — y dónde no.
      </h3>
      <p className="text-xs text-slate-500 mb-5 leading-relaxed max-w-2xl">
        Promedios del shortlist por dimensión del ICS. Una dimensión baja es
        tu palanca de mejora: ajustá el contexto operativo o las skills que
        pides para ver candidatos distintos.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {rows.map((row) => {
          const value = dims[row.key];
          const tone =
            value >= 65
              ? 'bg-emerald-500'
              : value >= 45
                ? 'bg-amber-400'
                : 'bg-rose-400';
          return (
            <div key={row.key} className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-800">{row.label}</span>
                <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                  {value}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${tone} transition-all`}
                  style={{ width: `${value}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">{row.help}</p>
            </div>
          );
        })}
      </div>
      {dims.penalties > 0 && (
        <div className="mt-4 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>Penalización promedio:</strong> {dims.penalties} pts. Las
            restricciones duras están descontando puntos al pool. Si esto pasa
            sistemáticamente, considerá flexibilizarlas.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── SkillsCoverageWidget ───────────────────────────────────────────────────

function SkillsCoverageWidget({
  coverage,
}: {
  coverage: { covered: string[]; missing: string[]; coveragePct: number };
}) {
  if (coverage.covered.length + coverage.missing.length === 0) {
    return null;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <Target size={12} className="text-emerald-600" />
        Cobertura de skills
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-5">
        ¿Qué pediste vs. qué tiene el shortlist?
      </h3>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-2 flex items-center gap-1.5">
            <CheckCircle2 size={11} /> Cubiertas ({coverage.covered.length})
          </div>
          {coverage.covered.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              Ninguna skill cubierta por el shortlist actual.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {coverage.covered.map((s) => (
                <Badge
                  key={s}
                  className="bg-emerald-50 text-emerald-800 border border-emerald-200"
                >
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-rose-600 font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} /> No cubiertas ({coverage.missing.length})
          </div>
          {coverage.missing.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              El pool cubre todas las skills que pediste.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {coverage.missing.map((s) => (
                <Badge
                  key={s}
                  className="bg-rose-50 text-rose-700 border border-rose-200"
                >
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      {coverage.missing.length > 0 && (
        <p className="mt-4 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
          <strong className="text-slate-700">Insight:</strong> los jóvenes en
          el shortlist no muestran evidencia citada de las skills no cubiertas.
          Eso no significa que no las tengan — solo que no las nombraron en su
          entrevista. Si son críticas, considerá proponer una microtask que
          las ponga a prueba.
        </p>
      )}
    </div>
  );
}

// ─── CompanyProfileWidget ───────────────────────────────────────────────────

function CompanyProfileWidget({
  loading,
  companyProfile,
  need,
}: {
  loading: boolean;
  companyProfile: CompanyProfile | null;
  need: CompanyNeed;
}) {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 animate-pulse">
        <div className="h-4 w-1/3 bg-slate-200 rounded mb-3" />
        <div className="h-3 w-2/3 bg-slate-100 rounded" />
      </div>
    );
  }
  // Si no hay companyProfile (endpoint falló o no devolvió), usamos data del need.
  const profile: CompanyProfile = companyProfile ?? {
    legal: need.legal ?? null,
    ownerName: need.ownerName ?? null,
    ownerEmail: need.ownerEmail ?? null,
    totalNeeds: 1,
    otherNeeds: [],
    isFirstNeed: true,
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <Building2 size={12} className="text-emerald-600" />
        Perfil de la empresa
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-4">
        {need.companyName}
      </h3>

      <dl className="space-y-2.5 text-sm">
        {profile.legal?.taxId && (
          <div className="flex items-start gap-3">
            <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold w-20 flex-shrink-0 pt-0.5">
              NIT
            </dt>
            <dd className="text-slate-800 font-mono">{profile.legal.taxId}</dd>
          </div>
        )}
        {profile.legal?.legalRepName && (
          <div className="flex items-start gap-3">
            <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold w-20 flex-shrink-0 pt-0.5">
              Rep. legal
            </dt>
            <dd className="text-slate-800">{profile.legal.legalRepName}</dd>
          </div>
        )}
        {profile.ownerName && (
          <div className="flex items-start gap-3">
            <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold w-20 flex-shrink-0 pt-0.5">
              Contacto
            </dt>
            <dd className="text-slate-800">{profile.ownerName}</dd>
          </div>
        )}
        {profile.ownerEmail && (
          <div className="flex items-start gap-3">
            <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold w-20 flex-shrink-0 pt-0.5">
              Email
            </dt>
            <dd className="text-slate-700 inline-flex items-center gap-1">
              <Mail size={11} className="text-slate-400" />
              <span className="truncate">{profile.ownerEmail}</span>
            </dd>
          </div>
        )}
      </dl>

      {/* Otras needs */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold inline-flex items-center gap-1.5">
            <Briefcase size={11} />
            Otras búsquedas activas
          </span>
          {profile.totalNeeds > 0 && (
            <span className="text-[10px] text-slate-400 tabular-nums">
              {profile.totalNeeds} total
            </span>
          )}
        </div>
        {profile.isFirstNeed ? (
          <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <Sparkles size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-emerald-900 leading-relaxed">
              Primera necesidad publicada por esta empresa en SaltoAI.
            </span>
          </div>
        ) : profile.otherNeeds.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            Sin otras búsquedas para mostrar.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {profile.otherNeeds.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/empresa/matches/${n.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors group"
                >
                  <span className="text-sm text-slate-800 truncate">{n.role}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {n.status === 'active' && (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
                        activa
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {formatAgo(n.createdAt)}
                    </span>
                    <ChevronRight size={12} className="text-slate-300 group-hover:text-emerald-500" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── EngagementWidget ───────────────────────────────────────────────────────

function EngagementWidget({
  loading,
  engagement,
}: {
  loading: boolean;
  engagement: Engagement | null;
}) {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 animate-pulse">
        <div className="h-4 w-1/3 bg-slate-200 rounded mb-3" />
        <div className="h-3 w-2/3 bg-slate-100 rounded" />
      </div>
    );
  }
  if (!engagement) return null;

  const isEmpty = engagement.totalSignals === 0;

  return (
    <div className="bg-slate-950 text-white rounded-2xl p-5 md:p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300 font-semibold mb-1">
          <Activity size={12} />
          Actividad sobre esta necesidad
        </div>
        <h3 className="font-display font-semibold text-lg text-white mb-4">
          {isEmpty
            ? 'Sin actividad medida todavía'
            : 'Qué está pasando con tu shortlist'}
        </h3>

        {isEmpty ? (
          <p className="text-sm text-slate-300 leading-relaxed">
            Cuando interactúes con candidatos (abrir perfiles, proponer
            microtasks, marcar útiles, dejar feedback), las señales van a
            aparecer acá. El motor también las usa para reentrenar.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <MiniStat
                icon={<Eye size={11} />}
                label="Perfiles abiertos"
                value={engagement.profileClicks}
              />
              <MiniStat
                icon={<Sparkles size={11} />}
                label="Microtasks"
                value={engagement.microtaskProposals}
              />
              <MiniStat
                icon={<Star size={11} />}
                label="Útiles"
                value={engagement.matchUsefulCount}
              />
              <MiniStat
                icon={<ThumbsDown size={11} />}
                label="No útiles"
                value={engagement.matchNotUsefulCount + engagement.passReasons}
              />
            </div>
            <div className="text-xs text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
              <strong className="text-slate-200">Última actividad:</strong>{' '}
              {formatAgo(engagement.lastActivityAt)} ·{' '}
              <strong className="text-slate-200">total de señales:</strong>{' '}
              {engagement.totalSignals}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
        <span className="text-emerald-400">{icon}</span>
        {label}
      </div>
      <div className="font-display font-bold text-xl text-white tabular-nums">
        {value}
      </div>
    </div>
  );
}
