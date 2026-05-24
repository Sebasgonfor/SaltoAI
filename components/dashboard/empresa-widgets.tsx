'use client';

/**
 * Widgets enriquecidos del dashboard del founder (`/empresa`).
 *
 * Consume `/api/dashboard/empresa?uid=X` (un solo request, todos los KPIs +
 * funnel + calibración + top candidates + necesidades con salud + financials).
 *
 * Filosofía: convertir "lista de needs + tasks" en una vista de inteligencia
 * operativa. El founder tiene 30s para mirar su dashboard antes de la próxima
 * reunión — cada widget debe decirle algo accionable.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Users,
  TrendingUp,
  DollarSign,
  HeartPulse,
  Target,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Star,
  Briefcase,
  ChevronRight,
  Eye,
  Zap,
} from 'lucide-react';

// ─── Tipos del endpoint ──────────────────────────────────────────────────────

interface DashboardEmpresaData {
  kpis: {
    needsCount: number;
    activeTasks: number;
    pendingEvaluations: number;
    closed: number;
    candidatesInPipeline: number;
    hiresConfirmed: number;
    avgIcsAcrossNeeds: number;
    feedbackReceived: number;
  };
  pipelineFunnel: {
    needsPublished: number;
    totalShortlist: number;
    profilesOpened: number;
    microtasksProposed: number;
    microtasksDelivered: number;
    microtasksRated: number;
    hiresConfirmed: number;
    conversionRates: {
      shortlistToOpen: number;
      openToMicrotask: number;
      microtaskToHire: number;
    };
  };
  calibration: {
    totalPaired: number;
    pairs: { icsAtMatch: number; founderRating: number; delta: number }[];
    avgDelta: number;
    alignmentLabel: 'alineado' | 'optimista' | 'conservador' | 'sin_datos';
  };
  topCandidates: {
    profileId: string;
    name: string;
    appearancesInShortlists: number;
    avgIcsAcrossNeeds: number;
    microtasksProposed: number;
    microtasksCompleted: number;
  }[];
  needsWithHealth: {
    id: string;
    role: string;
    createdAt: number;
    shortlistSize: number;
    avgIcs: number;
    healthScore: number;
    topIssue: string | null;
  }[];
  financials: {
    totalInvestedCOP: number;
    averageTaskCOP: number;
    paidCount: number;
    pendingCount: number;
  };
}

// ─── Hook de fetch ──────────────────────────────────────────────────────────

function useDashboardData(uid: string | undefined) {
  const [data, setData] = useState<DashboardEmpresaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/empresa?uid=${encodeURIComponent(uid)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as DashboardEmpresaData;
        if (!cancelled) setData(json);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { data, loading };
}

// ─── Componente principal ───────────────────────────────────────────────────

export function EmpresaWidgets({ uid }: { uid: string }) {
  const { data, loading } = useDashboardData(uid);

  if (loading) {
    return (
      <section className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </section>
    );
  }
  if (!data) return null;

  return (
    <section className="space-y-5" aria-label="Métricas enriquecidas">
      {/* ── Hero KPI strip enriquecido (4 cards adicionales a las base) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users size={14} />}
          label="Candidatos en pipeline"
          value={data.kpis.candidatesInPipeline}
          hint="Únicos vistos / con microtask"
          tone="emerald"
        />
        <KpiCard
          icon={<TrendingUp size={14} />}
          label="ICS promedio"
          value={data.kpis.avgIcsAcrossNeeds}
          unit="%"
          hint={`${data.kpis.feedbackReceived} feedbacks dados`}
          tone={
            data.kpis.avgIcsAcrossNeeds >= 70
              ? 'good'
              : data.kpis.avgIcsAcrossNeeds >= 50
                ? 'warn'
                : 'neutral'
          }
        />
        <KpiCard
          icon={<DollarSign size={14} />}
          label="Invertido COP"
          value={`$${(data.financials.totalInvestedCOP / 1000).toFixed(0)}k`}
          hint={`${data.financials.paidCount} microtasks pagadas`}
        />
        <KpiCard
          icon={<Star size={14} />}
          label="Hires confirmados"
          value={data.kpis.hiresConfirmed}
          hint={
            data.kpis.hiresConfirmed === 0
              ? 'Marca "lo contraté" tras la microtask'
              : 'Contratación formal validada'
          }
          tone={data.kpis.hiresConfirmed > 0 ? 'good' : 'neutral'}
        />
      </div>

      {/* ── Pipeline funnel ── */}
      <PipelineFunnelWidget funnel={data.pipelineFunnel} />

      {/* ── Calibración + Salud por necesidad ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <CalibrationWidget calibration={data.calibration} />
        <NeedsHealthWidget needs={data.needsWithHealth} />
      </div>

      {/* ── Top candidatos cross-need ── */}
      {data.topCandidates.length > 0 && (
        <TopCandidatesWidget candidates={data.topCandidates} />
      )}
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
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad' | 'emerald' | 'neutral';
}) {
  const color =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'emerald'
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
      <div className={`font-display font-bold text-2xl md:text-3xl tabular-nums leading-none ${color}`}>
        {value}
        {unit && <span className="text-base font-semibold ml-0.5">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">{hint}</div>}
    </div>
  );
}

// ─── PipelineFunnelWidget ────────────────────────────────────────────────────

function PipelineFunnelWidget({
  funnel,
}: {
  funnel: DashboardEmpresaData['pipelineFunnel'];
}) {
  const stages = [
    { label: 'Shortlist', value: funnel.totalShortlist, key: 'sh' },
    { label: 'Perfiles abiertos', value: funnel.profilesOpened, key: 'op' },
    { label: 'Microtasks propuestas', value: funnel.microtasksProposed, key: 'mp' },
    { label: 'Entregadas', value: funnel.microtasksDelivered, key: 'md' },
    { label: 'Evaluadas', value: funnel.microtasksRated, key: 'mr' },
    { label: 'Contratados', value: funnel.hiresConfirmed, key: 'hi' },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  const tones = [
    'bg-emerald-500',
    'bg-emerald-500',
    'bg-amber-400',
    'bg-amber-400',
    'bg-slate-700',
    'bg-slate-900',
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <Activity size={12} className="text-emerald-600" />
        Tu pipeline de contratación
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">
        Del match al hire — paso por paso.
      </h3>
      <p className="text-xs text-slate-500 mb-5 max-w-2xl leading-relaxed">
        Cada etapa cae más a la derecha. Las pérdidas grandes entre etapas son tu
        palanca: si abres muchos perfiles pero propones pocas microtasks, el
        cuello de botella está en el primer interview.
      </p>

      <div className="space-y-2.5">
        {stages.map((s, i) => {
          const pct = (s.value / max) * 100;
          return (
            <div key={s.key} className="flex items-center gap-3 text-sm">
              <div className="w-44 text-slate-700 truncate">{s.label}</div>
              <div className="flex-1 h-7 bg-slate-100 rounded-lg relative overflow-hidden">
                <div
                  className={`h-full rounded-lg transition-all ${tones[i]}`}
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-y-0 left-3 flex items-center text-xs text-white font-semibold tabular-nums">
                  {s.value > 0 && s.value}
                </span>
              </div>
              <div className="w-12 text-right font-mono tabular-nums font-bold text-slate-900">
                {s.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-3 text-center">
        <ConversionStat
          label="Shortlist → Abrir"
          value={funnel.conversionRates.shortlistToOpen}
        />
        <ConversionStat
          label="Abrir → Microtask"
          value={funnel.conversionRates.openToMicrotask}
        />
        <ConversionStat
          label="Microtask → Hire"
          value={funnel.conversionRates.microtaskToHire}
          highlight
        />
      </div>
    </div>
  );
}

function ConversionStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  const color = highlight
    ? value >= 30
      ? 'text-emerald-600'
      : 'text-amber-600'
    : 'text-slate-900';
  return (
    <div>
      <div className={`font-display font-bold text-xl tabular-nums ${color}`}>
        {value}%
      </div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">
        {label}
      </div>
    </div>
  );
}

// ─── CalibrationWidget ──────────────────────────────────────────────────────

function CalibrationWidget({
  calibration,
}: {
  calibration: DashboardEmpresaData['calibration'];
}) {
  if (calibration.alignmentLabel === 'sin_datos' || calibration.totalPaired === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
          <Zap size={12} className="text-emerald-600" />
          Calibración del motor IA
        </div>
        <h3 className="font-display font-semibold text-lg text-slate-900 mb-3">
          Sin pares pre-eval vs. rating todavía
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          Cuando evaluás microtasks, comparamos tu rating con la pre-eval que
          hizo la IA. Si el motor está optimista o conservador, lo vas a ver acá.
          Eso reentrena los pesos.
        </p>
      </div>
    );
  }
  const tone =
    calibration.alignmentLabel === 'alineado'
      ? { color: 'text-emerald-600', label: 'Bien alineado', bg: 'bg-emerald-50/40 border-emerald-200/60' }
      : calibration.alignmentLabel === 'optimista'
        ? { color: 'text-amber-600', label: 'IA optimista', bg: 'bg-amber-50/40 border-amber-200/60' }
        : { color: 'text-rose-600', label: 'IA conservadora', bg: 'bg-rose-50/40 border-rose-200/60' };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <Zap size={12} className="text-emerald-600" />
        Calibración del motor IA
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-3">
        ¿La pre-eval coincide con tu juicio?
      </h3>

      <div className={`${tone.bg} border rounded-xl p-3 mb-4 flex items-start gap-2.5`}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${tone.color}`}>
          <Sparkles size={13} />
        </div>
        <div className="flex-1">
          <div className={`font-semibold text-sm ${tone.color}`}>{tone.label}</div>
          <p className="text-xs text-slate-700 leading-relaxed mt-0.5">
            Delta promedio:{' '}
            <strong className="font-mono tabular-nums">
              {calibration.avgDelta > 0 ? '+' : ''}{calibration.avgDelta}
            </strong>{' '}
            puntos sobre {calibration.totalPaired} microtasks evaluadas.
            {calibration.alignmentLabel === 'optimista' &&
              ' La IA está prediciendo mejor de lo que tú confirmás — bajaremos el peso de la pre-eval.'}
            {calibration.alignmentLabel === 'conservador' &&
              ' La IA está siendo más dura que vos — los candidatos son mejores de lo que predijo.'}
            {calibration.alignmentLabel === 'alineado' &&
              ' El motor está calibrado para tu criterio. Las pre-evals son confiables.'}
          </p>
        </div>
      </div>

      {/* Pairs preview: max 5 más recientes */}
      <div className="space-y-1.5">
        {calibration.pairs.slice(0, 5).map((p, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors"
          >
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono tabular-nums text-slate-500">
                IA: <strong className="text-slate-900">{p.icsAtMatch}</strong>
              </span>
              <ArrowRight size={11} className="text-slate-300" />
              <span className="font-mono tabular-nums text-slate-500">
                Tu rating:{' '}
                <strong className="text-amber-600">{p.founderRating}/5</strong>
              </span>
            </div>
            <span
              className={`text-[10px] font-mono tabular-nums font-semibold ${
                Math.abs(p.delta) <= 10
                  ? 'text-emerald-600'
                  : p.delta > 0
                    ? 'text-amber-600'
                    : 'text-rose-600'
              }`}
            >
              {p.delta > 0 ? '+' : ''}{p.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NeedsHealthWidget ─────────────────────────────────────────────────────

function NeedsHealthWidget({
  needs,
}: {
  needs: DashboardEmpresaData['needsWithHealth'];
}) {
  if (needs.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
          <HeartPulse size={12} className="text-emerald-600" />
          Salud de tus necesidades
        </div>
        <p className="text-sm text-slate-500 mt-3">
          Sin necesidades publicadas todavía.
        </p>
      </div>
    );
  }
  // Order: peor salud primero (las que más necesitan atención).
  const sorted = [...needs].sort((a, b) => a.healthScore - b.healthScore);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <HeartPulse size={12} className="text-emerald-600" />
        Salud de tus necesidades
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">
        Cuáles afinar primero
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Score 0-100 que combina contexto, skills declaradas y rasgos. Las
        peores arriba.
      </p>

      <div className="space-y-2">
        {sorted.slice(0, 5).map((n) => {
          const tone =
            n.healthScore >= 80
              ? { dot: 'bg-emerald-500', text: 'text-emerald-600' }
              : n.healthScore >= 50
                ? { dot: 'bg-amber-400', text: 'text-amber-600' }
                : { dot: 'bg-rose-500', text: 'text-rose-600' };
          return (
            <Link key={n.id} href={`/empresa/matches/${n.id}`}>
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors group">
                <span className={`w-2 h-2 rounded-full ${tone.dot} flex-shrink-0 mt-2`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {n.role}
                    </span>
                    <span className={`font-mono tabular-nums text-xs font-bold ${tone.text}`}>
                      {n.healthScore}
                    </span>
                  </div>
                  {n.topIssue && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      <AlertTriangle size={9} className="inline mr-1 text-amber-500" />
                      {n.topIssue}
                    </p>
                  )}
                </div>
                <ChevronRight
                  size={13}
                  className="text-slate-300 group-hover:text-emerald-500 flex-shrink-0 mt-1.5"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── TopCandidatesWidget ───────────────────────────────────────────────────

function TopCandidatesWidget({
  candidates,
}: {
  candidates: DashboardEmpresaData['topCandidates'];
}) {
  return (
    <div className="bg-slate-950 text-white rounded-2xl p-5 md:p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300 font-semibold mb-1">
          <Sparkles size={12} />
          Top candidatos cross-need
        </div>
        <h3 className="font-display font-semibold text-lg text-white mb-1">
          Los perfiles que aparecen una y otra vez en tus shortlists.
        </h3>
        <p className="text-xs text-slate-400 mb-4 max-w-2xl leading-relaxed">
          Si un mismo joven sube en múltiples búsquedas tuyas con ICS alto, es
          señal de fit transversal — vale la pena el follow-up.
        </p>

        <div className="space-y-1.5">
          {candidates.map((c) => (
            <Link key={c.profileId} href={`/joven/perfil/${c.profileId}`}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 transition-colors group">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                  {c.name
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{c.name}</div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                    <span>
                      <Eye size={9} className="inline mr-1" />
                      {c.appearancesInShortlists} vistas
                    </span>
                    {c.avgIcsAcrossNeeds > 0 && (
                      <span>
                        ICS ~<strong className="text-emerald-300">{c.avgIcsAcrossNeeds}</strong>
                      </span>
                    )}
                    {c.microtasksProposed > 0 && (
                      <span>
                        <Briefcase size={9} className="inline mr-1" />
                        {c.microtasksProposed} task{c.microtasksProposed === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  className="text-slate-500 group-hover:text-emerald-300 flex-shrink-0"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
