'use client';

/**
 * Dashboard visual rico de la empresa (`/empresa`).
 *
 * Rediseñado con lenguaje visual tipo "pasaporte del founder":
 *   - Hero dark con avatar (iniciales) + categoría + ring (Salud del pipeline)
 *   - Grid 3-col: ADN radar de búsqueda + Inversión + Top candidatos cross-need
 *   - Grid 2x2 estilo founder + Necesidades con salud (lista priorizada)
 *   - Pipeline funnel + Calibración
 *
 * Toda la data viene de `/api/dashboard/empresa` + `needs` y `tasks` que ya
 * están en `/empresa/page.tsx`.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Eye,
  HeartPulse,
  Sparkles,
  Star,
  Zap,
  AlertTriangle,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { CompanyNeed, MicroTask } from '@/lib/types';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useDashboardData(uid: string | undefined) {
  const [data, setData] = useState<DashboardEmpresaData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/empresa?uid=${encodeURIComponent(uid)}`);
        if (!res.ok) return;
        const json = (await res.json()) as DashboardEmpresaData;
        if (!cancelled) setData(json);
      } catch {/* silent */}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [uid]);
  return { data, loading };
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-CO', {
    month: 'short',
    year: 'numeric',
  });
}

function inferFounderCategory(
  needs: CompanyNeed[],
  data: DashboardEmpresaData,
): string {
  if (needs.length === 0) return 'Founder en SaltoAI';
  if (data.kpis.hiresConfirmed >= 2) return 'Constructor de equipo';
  if (needs.length >= 3) return 'Founder en crecimiento';
  if (data.kpis.candidatesInPipeline >= 5) return 'Founder activo';
  if (data.calibration.alignmentLabel === 'alineado') return 'Founder calibrado';
  return 'Founder en SaltoAI';
}

/** ADN de búsqueda (5 ejes). */
function computeRadar(
  data: DashboardEmpresaData,
): { axis: string; value: number; raw: number; help: string }[] {
  const avgHealth =
    data.needsWithHealth.length === 0
      ? 0
      : Math.round(
          data.needsWithHealth.reduce((a, b) => a + b.healthScore, 0) /
            data.needsWithHealth.length,
        );
  const cap = (raw: number, max: number) =>
    Math.min(100, Math.round((raw / max) * 100));

  return [
    { axis: 'Salud', value: avgHealth, raw: avgHealth, help: 'Health score promedio' },
    { axis: 'Pipeline', value: cap(data.kpis.candidatesInPipeline, 15), raw: data.kpis.candidatesInPipeline, help: 'Candidatos únicos' },
    { axis: 'Match IA', value: data.kpis.avgIcsAcrossNeeds, raw: data.kpis.avgIcsAcrossNeeds, help: 'ICS promedio' },
    { axis: 'Conversión', value: data.pipelineFunnel.conversionRates.microtaskToHire, raw: data.pipelineFunnel.conversionRates.microtaskToHire, help: 'Microtask → hire %' },
    { axis: 'Inversión', value: cap(data.financials.totalInvestedCOP, 5_000_000), raw: data.financials.totalInvestedCOP, help: 'COP invertido' },
  ];
}

function computeHireScore(data: DashboardEmpresaData): number {
  const r = computeRadar(data);
  return Math.round(r.reduce((a, b) => a + b.value, 0) / r.length);
}

// ─── Componente principal ───────────────────────────────────────────────────

interface Props {
  uid: string;
  companyName: string;
  needs: CompanyNeed[];
  tasks: MicroTask[];
}

export function EmpresaWidgets({ uid, companyName, needs, tasks }: Props) {
  const { data, loading } = useDashboardData(uid);

  const radar = useMemo(() => (data ? computeRadar(data) : []), [data]);
  const hireScore = useMemo(() => (data ? computeHireScore(data) : 0), [data]);
  const category = useMemo(
    () => (data ? inferFounderCategory(needs, data) : 'Founder en SaltoAI'),
    [needs, data],
  );

  if (loading || !data) {
    return (
      <section className="space-y-5" aria-label="Pasaporte del founder">
        <div className="h-44 rounded-3xl bg-slate-100 animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 rounded-3xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-label="Pasaporte del founder">
      {/* ─── HERO ────────────────────────────────────────────────────── */}
      <HeroDark
        avatarText={initials(companyName)}
        name={companyName}
        category={category}
        ringValue={hireScore}
        ringLabel="Hire Score"
        statusText={`${needs.length} ${needs.length === 1 ? 'necesidad activa' : 'necesidades activas'} · ${tasks.length} microtasks creadas`}
        stats={[
          { icon: '🎯', label: 'Necesidades', value: String(data.kpis.needsCount) },
          { icon: '👥', label: 'Candidatos', value: String(data.kpis.candidatesInPipeline) },
          { icon: '💼', label: 'Microtasks', value: String(tasks.length) },
          { icon: '✅', label: 'Hires', value: String(data.kpis.hiresConfirmed) },
        ]}
      />

      {/* ─── Grid 3-col superior ─────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <RadarCard
          title="ADN de búsqueda"
          subtitle="Tu motor en 5 ejes"
          axes={radar}
        />
        <InversionCard financials={data.financials} tasks={tasks} />
        <CandidatesCard candidates={data.topCandidates} />
      </div>

      {/* ─── Pipeline funnel ─────────────────────────────────────────── */}
      <PipelineCard funnel={data.pipelineFunnel} />

      {/* ─── Grid 2x2 estilo + Necesidades con salud ─────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <StyleGrid tiles={inferStyleTiles(needs, tasks, data)} className="lg:col-span-2" />
        <NeedsHealthCard needs={data.needsWithHealth} />
      </div>

      {/* ─── Calibración ─────────────────────────────────────────────── */}
      <CalibrationCard calibration={data.calibration} />
    </section>
  );
}

// ─── HeroDark ────────────────────────────────────────────────────────────────

function HeroDark({
  avatarText,
  name,
  category,
  ringValue,
  ringLabel,
  statusText,
  stats,
}: {
  avatarText: string;
  name: string;
  category: string;
  ringValue: number;
  ringLabel: string;
  statusText: string;
  stats: { icon: string; label: string; value: string }[];
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950/40 text-white p-5 md:p-7">
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl" aria-hidden />
      <div className="relative flex flex-col md:flex-row md:items-center gap-5">
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-display font-bold text-2xl md:text-3xl shadow-lg shadow-amber-900/40">
            {avatarText || '·'}
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-stone-950 flex items-center justify-center">
            <CheckCircle2 size={12} className="text-white" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h1 className="font-display font-bold text-2xl md:text-3xl tracking-tight">
              {name}
            </h1>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold shadow-sm">
              {category}
            </span>
            {ringValue >= 70 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-950/40 border border-amber-700/40 text-amber-300 text-xs font-semibold">
                Score {ringValue}
              </span>
            )}
          </div>
          <p className="text-stone-400 text-sm">{statusText}</p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className="text-xl leading-none">{s.icon}</span>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                    {s.label}
                  </div>
                  <div className="font-display font-bold text-base text-white tabular-nums truncate">
                    {s.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col items-center">
          <RingScore value={ringValue} size={108} />
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-semibold mt-2">
            {ringLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RingScore SVG ──────────────────────────────────────────────────────────

function RingScore({ value, size = 96 }: { value: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (clamped / 100) * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={cx} cy={cy} r={r}
          stroke="url(#ringGradEmp)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="ringGradEmp" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-3xl text-white tabular-nums leading-none">
          {clamped}
        </span>
      </div>
    </div>
  );
}

// ─── RadarCard ─────────────────────────────────────────────────────────────

function RadarCard({
  title,
  subtitle,
  axes,
}: {
  title: string;
  subtitle?: string;
  axes: { axis: string; value: number; raw: number; help: string }[];
}) {
  if (axes.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
        <SectionTitle title={title} />
        <p className="text-sm text-stone-500 mt-3">Sin datos suficientes.</p>
      </div>
    );
  }
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 14;
  const N = axes.length;

  const points = axes.map((a, i) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    const v = a.value / 100;
    return {
      x: cx + Math.cos(angle) * radius * v,
      y: cy + Math.sin(angle) * radius * v,
    };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');
  const rings = [0.25, 0.5, 0.75, 1.0];
  const axisLines = axes.map((_, i) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
        <svg width={size} height={size} className="flex-shrink-0">
          {rings.map((r, i) => (
            <polygon
              key={i}
              points={axes
                .map((_, j) => {
                  const angle = (Math.PI * 2 * j) / N - Math.PI / 2;
                  const x = cx + Math.cos(angle) * radius * r;
                  const y = cy + Math.sin(angle) * radius * r;
                  return `${x},${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#e7e5e4"
              strokeWidth={1}
            />
          ))}
          {axisLines.map((p, i) => (
            <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e7e5e4" strokeWidth={1} />
          ))}
          <polygon points={polygon} fill="rgba(234, 88, 12, 0.18)" stroke="#ea580c" strokeWidth={2} />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#ea580c" />
          ))}
          {axes.map((a, i) => {
            const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
            const x = cx + Math.cos(angle) * (radius + 6);
            const y = cy + Math.sin(angle) * (radius + 6);
            const anchor: 'start' | 'middle' | 'end' =
              x < cx - 1 ? 'end' : x > cx + 1 ? 'start' : 'middle';
            return (
              <text
                key={i}
                x={x}
                y={y}
                fontSize={9}
                textAnchor={anchor}
                dominantBaseline="middle"
                fill="#78716c"
                fontWeight="600"
              >
                {a.axis}
              </text>
            );
          })}
        </svg>
        <div className="flex-1 w-full space-y-2 min-w-0">
          {axes.map((a) => (
            <div key={a.axis} className="flex items-center gap-3 text-sm">
              <span className="text-stone-700 w-24 truncate text-xs">{a.axis}</span>
              <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 transition-all" style={{ width: `${a.value}%` }} />
              </div>
              <span className="font-mono tabular-nums text-xs font-bold text-stone-900 w-7 text-right">
                {a.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── InversionCard (presupuesto-like) ──────────────────────────────────────

function InversionCard({
  financials,
  tasks,
}: {
  financials: DashboardEmpresaData['financials'];
  tasks: MicroTask[];
}) {
  const paidSum = tasks.filter((t) => t.status === 'paid').reduce((a, t) => a + (t.amountCOP ?? 0), 0);
  const evaluatedSum = tasks.filter((t) => t.status === 'evaluated').reduce((a, t) => a + (t.amountCOP ?? 0), 0);
  const deliveredSum = tasks.filter((t) => t.status === 'delivered').reduce((a, t) => a + (t.amountCOP ?? 0), 0);
  const pendingSum = tasks
    .filter((t) => t.status === 'pending' || t.status === 'in_progress')
    .reduce((a, t) => a + (t.amountCOP ?? 0), 0);

  const max = Math.max(1, paidSum, evaluatedSum, deliveredSum, pendingSum);
  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Pagadas', value: paidSum, color: 'bg-emerald-500' },
    { label: 'Evaluadas', value: evaluatedSum, color: 'bg-emerald-400' },
    { label: 'Por evaluar', value: deliveredSum, color: 'bg-amber-400' },
    { label: 'En progreso', value: pendingSum, color: 'bg-stone-300' },
  ];

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <SectionTitle title="Inversión en talento" />
      <div className="mt-3">
        <div className="font-display font-bold text-4xl text-stone-900 tabular-nums leading-none">
          ${financials.totalInvestedCOP.toLocaleString('es-CO')}
        </div>
        <div className="text-xs text-stone-500 mt-1">
          COP · {tasks.length} {tasks.length === 1 ? 'microtask' : 'microtasks'} creadas
          {financials.averageTaskCOP > 0 && ` · prom $${financials.averageTaskCOP.toLocaleString('es-CO')}/u`}
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 text-sm">
            <span className="text-stone-700 flex-1 truncate text-xs">{r.label}</span>
            <div className="w-24 h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div className={`h-full ${r.color}`} style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
            <span className="font-mono tabular-nums text-xs font-semibold text-stone-900 w-16 text-right">
              ${r.value.toLocaleString('es-CO')}
            </span>
          </div>
        ))}
      </div>
      {financials.pendingCount > 0 && (
        <div className="mt-5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center gap-2 text-xs text-amber-900">
          <span>⏳</span>
          <span><strong>{financials.pendingCount}</strong> microtask{financials.pendingCount === 1 ? '' : 's'} en curso esperando entrega.</span>
        </div>
      )}
    </div>
  );
}

// ─── CandidatesCard (flag rows estilo) ─────────────────────────────────────

function CandidatesCard({
  candidates,
}: {
  candidates: DashboardEmpresaData['topCandidates'];
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <SectionTitle title="Top candidatos" />
        {candidates.length > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-semibold">
            {candidates.length} cross-need
          </span>
        )}
      </div>
      {candidates.length === 0 ? (
        <p className="text-sm text-stone-500 mt-3 leading-relaxed">
          Cuando abras perfiles o propongas microtasks, los candidatos que
          aparezcan en varias búsquedas tuyas van a salir acá ordenados.
        </p>
      ) : (
        candidates.map((c) => (
          <Link key={c.profileId} href={`/joven/perfil/${c.profileId}`}>
            <div className="mt-3 group cursor-pointer">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 truncate group-hover:text-orange-700 transition-colors">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-stone-500 truncate">
                      {c.appearancesInShortlists} {c.appearancesInShortlists === 1 ? 'aparición' : 'apariciones'}
                      {c.microtasksProposed > 0 && ` · ${c.microtasksProposed} task${c.microtasksProposed === 1 ? '' : 's'}`}
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700 flex-shrink-0">
                  ICS {c.avgIcsAcrossNeeds || '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 transition-all" style={{ width: `${c.avgIcsAcrossNeeds}%` }} />
                </div>
                <span className="text-[11px] font-mono tabular-nums font-bold text-stone-900 w-9 text-right">
                  {c.avgIcsAcrossNeeds || 0}%
                </span>
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

// ─── PipelineCard ──────────────────────────────────────────────────────────

function PipelineCard({
  funnel,
}: {
  funnel: DashboardEmpresaData['pipelineFunnel'];
}) {
  const stages = [
    { emoji: '🎯', label: 'Shortlist', value: funnel.totalShortlist },
    { emoji: '👀', label: 'Perfiles abiertos', value: funnel.profilesOpened },
    { emoji: '💼', label: 'Microtasks propuestas', value: funnel.microtasksProposed },
    { emoji: '📦', label: 'Entregadas', value: funnel.microtasksDelivered },
    { emoji: '⭐', label: 'Evaluadas', value: funnel.microtasksRated },
    { emoji: '✅', label: 'Contratados', value: funnel.hiresConfirmed },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <SectionTitle title="Pipeline de contratación" subtitle="Del match al hire" />
      </div>
      <div className="mt-4 space-y-2.5">
        {stages.map((s) => {
          const pct = (s.value / max) * 100;
          return (
            <div key={s.label} className="flex items-center gap-3 text-sm">
              <span className="text-xl leading-none w-7 text-center flex-shrink-0">{s.emoji}</span>
              <span className="text-stone-700 w-44 text-xs truncate">{s.label}</span>
              <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-mono tabular-nums text-xs font-bold text-stone-900 w-9 text-right">
                {s.value}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-5 pt-4 border-t border-stone-100 grid grid-cols-3 gap-3 text-center">
        <ConversionStat label="Shortlist → Abrir" value={funnel.conversionRates.shortlistToOpen} />
        <ConversionStat label="Abrir → Microtask" value={funnel.conversionRates.openToMicrotask} />
        <ConversionStat label="Microtask → Hire" value={funnel.conversionRates.microtaskToHire} highlight />
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
  const color = highlight ? (value >= 30 ? 'text-emerald-600' : 'text-amber-600') : 'text-stone-900';
  return (
    <div>
      <div className={`font-display font-bold text-xl tabular-nums ${color}`}>{value}%</div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mt-0.5">{label}</div>
    </div>
  );
}

// ─── StyleGrid ────────────────────────────────────────────────────────────

interface StyleTile {
  emoji: string;
  label: string;
  value: string;
  hint: string;
}

function inferStyleTiles(
  needs: CompanyNeed[],
  tasks: MicroTask[],
  data: DashboardEmpresaData,
): StyleTile[] {
  // Velocidad de publicación
  const newest = needs.reduce((m, n) => Math.max(m, n.createdAt), 0);
  const daysSinceNewest = newest === 0 ? 999 : Math.floor((Date.now() - newest) / (1000 * 60 * 60 * 24));
  const velocidad: StyleTile = daysSinceNewest <= 7
    ? { emoji: '🚀', label: 'Cadencia', value: 'Activa', hint: `Última necesidad publicada hace ${daysSinceNewest}d` }
    : daysSinceNewest <= 30
      ? { emoji: '📅', label: 'Cadencia', value: 'Regular', hint: `Última publicación hace ${daysSinceNewest}d` }
      : { emoji: '💤', label: 'Cadencia', value: 'Detenida', hint: 'Publicá una nueva necesidad' };

  // Estilo de evaluación: avg rating del founder
  const evals = tasks
    .filter((t) => typeof t.companyRating === 'number')
    .map((t) => t.companyRating!) ;
  const avgEval = evals.length === 0 ? 0 : evals.reduce((a, b) => a + b, 0) / evals.length;
  const estiloEval: StyleTile = avgEval === 0
    ? { emoji: '⏳', label: 'Estilo eval', value: 'Por estrenar', hint: 'Aún sin evaluaciones' }
    : avgEval >= 4
      ? { emoji: '🌟', label: 'Estilo eval', value: 'Generoso', hint: `Promedio ${avgEval.toFixed(1)}/5` }
      : avgEval >= 3
        ? { emoji: '⚖️', label: 'Estilo eval', value: 'Balanceado', hint: `Promedio ${avgEval.toFixed(1)}/5` }
        : { emoji: '🔥', label: 'Estilo eval', value: 'Exigente', hint: `Promedio ${avgEval.toFixed(1)}/5` };

  // Calibración con la IA
  const calibracion: StyleTile = data.calibration.alignmentLabel === 'alineado'
    ? { emoji: '🤝', label: 'Vs. IA', value: 'Alineado', hint: 'Tu juicio coincide con la pre-eval' }
    : data.calibration.alignmentLabel === 'optimista'
      ? { emoji: '🌤️', label: 'Vs. IA', value: 'IA optimista', hint: `Delta ${data.calibration.avgDelta} pts` }
      : data.calibration.alignmentLabel === 'conservador'
        ? { emoji: '🧊', label: 'Vs. IA', value: 'IA conservadora', hint: `Delta ${data.calibration.avgDelta} pts` }
        : { emoji: '🎲', label: 'Vs. IA', value: 'Sin pares aún', hint: 'Evaluá una microtask' };

  // Resultado: tasa de hire
  const conversion = data.pipelineFunnel.conversionRates.microtaskToHire;
  const conversionTile: StyleTile = conversion >= 30
    ? { emoji: '🏆', label: 'Conversión', value: 'Alta', hint: `${conversion}% microtask → hire` }
    : conversion >= 10
      ? { emoji: '📈', label: 'Conversión', value: 'Mejorando', hint: `${conversion}% microtask → hire` }
      : { emoji: '🌱', label: 'Conversión', value: 'En siembra', hint: 'Primer hire pendiente' };

  return [velocidad, estiloEval, calibracion, conversionTile];
}

function StyleGrid({
  tiles,
  className = '',
}: {
  tiles: StyleTile[];
  className?: string;
}) {
  return (
    <div className={`bg-white border border-stone-200 rounded-3xl p-5 md:p-6 ${className}`}>
      <SectionTitle title="Estilo de founder" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4">
            <div className="text-3xl leading-none mb-3">{t.emoji}</div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
              {t.label}
            </div>
            <div className="font-display font-bold text-base text-stone-900 mt-0.5">
              {t.value}
            </div>
            <div className="text-[11px] text-stone-500 mt-1 leading-snug">{t.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NeedsHealthCard ──────────────────────────────────────────────────────

function NeedsHealthCard({
  needs,
}: {
  needs: DashboardEmpresaData['needsWithHealth'];
}) {
  if (needs.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
        <SectionTitle title="Salud de búsquedas" />
        <p className="text-sm text-stone-500 mt-3">Sin necesidades publicadas aún.</p>
      </div>
    );
  }
  const sorted = [...needs].sort((a, b) => a.healthScore - b.healthScore);
  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <SectionTitle title="Salud de búsquedas" subtitle="Las peores arriba" />
      <div className="mt-4 space-y-2">
        {sorted.slice(0, 5).map((n) => {
          const dot =
            n.healthScore >= 80
              ? 'bg-emerald-500'
              : n.healthScore >= 50
                ? 'bg-amber-400'
                : 'bg-rose-500';
          const text =
            n.healthScore >= 80
              ? 'text-emerald-600'
              : n.healthScore >= 50
                ? 'text-amber-600'
                : 'text-rose-600';
          return (
            <Link key={n.id} href={`/empresa/matches/${n.id}`}>
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-stone-200 hover:border-orange-300 hover:bg-orange-50/30 transition-colors group">
                <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0 mt-1.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-stone-900 truncate">{n.role}</span>
                    <span className={`font-mono tabular-nums text-xs font-bold ${text}`}>
                      {n.healthScore}
                    </span>
                  </div>
                  {n.topIssue && (
                    <p className="text-[11px] text-stone-500 mt-0.5 truncate">
                      <AlertTriangle size={9} className="inline mr-1 text-amber-500" />
                      {n.topIssue}
                    </p>
                  )}
                </div>
                <ChevronRight size={13} className="text-stone-300 group-hover:text-orange-500 flex-shrink-0 mt-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── CalibrationCard ──────────────────────────────────────────────────────

function CalibrationCard({
  calibration,
}: {
  calibration: DashboardEmpresaData['calibration'];
}) {
  if (calibration.alignmentLabel === 'sin_datos' || calibration.totalPaired === 0) {
    return (
      <div className="bg-gradient-to-br from-stone-50 to-amber-50/30 border border-stone-200 rounded-3xl p-5 md:p-6">
        <SectionTitle title="Calibración del motor IA" />
        <p className="text-sm text-stone-600 mt-3 leading-relaxed">
          Cuando evalúes microtasks, comparamos tu rating con la pre-eval de la IA.
          El delta promedio nos dice si el motor está optimista, conservador o
          alineado con tu juicio. Eso reentrena los pesos.
        </p>
      </div>
    );
  }

  const tone =
    calibration.alignmentLabel === 'alineado'
      ? { emoji: '🎯', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200/60', label: 'Bien alineado' }
      : calibration.alignmentLabel === 'optimista'
        ? { emoji: '🌤️', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200/60', label: 'IA optimista' }
        : { emoji: '🧊', color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200/60', label: 'IA conservadora' };

  return (
    <div className={`border rounded-3xl p-5 md:p-6 ${tone.bg}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <SectionTitle title="Calibración del motor IA" />
          <h3 className={`font-display font-bold text-lg mt-1 ${tone.color}`}>
            {tone.emoji} {tone.label}
          </h3>
        </div>
        <div className="text-right">
          <div className={`font-display font-bold text-3xl tabular-nums ${tone.color}`}>
            {calibration.avgDelta > 0 ? '+' : ''}{calibration.avgDelta}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
            Delta promedio
          </div>
        </div>
      </div>
      <p className="text-sm text-stone-700 leading-relaxed mb-4">
        Sobre {calibration.totalPaired} microtasks evaluadas.
        {calibration.alignmentLabel === 'optimista' &&
          ' La IA predice mejor de lo que tú confirmás — bajaremos el peso de la pre-eval.'}
        {calibration.alignmentLabel === 'conservador' &&
          ' La IA es más dura que tú — los candidatos rinden mejor de lo previsto.'}
        {calibration.alignmentLabel === 'alineado' &&
          ' Las pre-evals son confiables para tu criterio.'}
      </p>
      <div className="space-y-1.5">
        {calibration.pairs.slice(0, 5).map((p, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/60 border border-stone-200"
          >
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono tabular-nums text-stone-500">
                IA: <strong className="text-stone-900">{p.icsAtMatch}</strong>
              </span>
              <ArrowRight size={11} className="text-stone-300" />
              <span className="font-mono tabular-nums text-stone-500">
                Tu rating: <strong className="text-amber-600">{p.founderRating}/5</strong>
              </span>
            </div>
            <span className={`text-[10px] font-mono tabular-nums font-semibold ${
              Math.abs(p.delta) <= 10 ? 'text-emerald-600' : p.delta > 0 ? 'text-amber-600' : 'text-rose-600'
            }`}>
              {p.delta > 0 ? '+' : ''}{p.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SectionTitle ─────────────────────────────────────────────────────────

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-stone-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}
