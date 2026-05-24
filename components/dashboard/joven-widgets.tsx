'use client';

/**
 * Dashboard visual rico del joven (`/dashboard`).
 *
 * Rediseñado con lenguaje visual tipo "pasaporte de talento":
 *   - Hero dark con avatar + categoría inferida + ring score (Pulso laboral)
 *   - Grid 3-col: ADN radar + Earnings card + Top oportunidades con badge
 *   - Grid 2x2 estilo de trabajo (emoji grandes + descripción)
 *   - Timeline historial con estrellas
 *
 * Toda la data viene de `/api/dashboard/joven` + el `profile` que ya está en
 * el scope de `/dashboard/page.tsx`. Sin endpoint extra.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  DollarSign,
  Eye,
  Inbox,
  MessageSquareQuote,
  Send,
  Sparkles,
  Star,
  ThumbsDown,
  Activity,
  TrendingUp,
} from 'lucide-react';
import type { Profile, MicroTask } from '@/lib/types';

// ─── Tipos del endpoint ──────────────────────────────────────────────────────

interface DashboardJovenData {
  earnings: {
    totalCOP: number;
    averageRating: number;
    completedCount: number;
    pendingCount: number;
  };
  marketVisibility: {
    totalActiveNeeds: number;
    needsMatchingMySkills: number;
    topSkillsInDemand: { skill: string; demandedBy: number; iHaveIt: boolean }[];
  };
  inboxSummary: {
    total: number;
    positiveFeedback: number;
    passReasons: number;
    unreplied: number;
  };
  verifiedSkills: {
    declared: number;
    verified: number;
    verifiedPct: number;
  };
  topOpportunity: {
    needId: string;
    companyName: string;
    role: string;
    approxIcs: number;
  } | null;
  activityTimeline: {
    type:
      | 'microtask_proposed'
      | 'microtask_delivered'
      | 'microtask_evaluated'
      | 'feedback_received'
      | 'pass_reason'
      | 'profile_viewed';
    ts: number;
    title: string;
    hint?: string;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useDashboardData(uid: string | undefined) {
  const [data, setData] = useState<DashboardJovenData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/joven?uid=${encodeURIComponent(uid)}`);
        if (!res.ok) return;
        const json = (await res.json()) as DashboardJovenData;
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

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.round(hr / 24);
  if (d < 30) return `hace ${d} d`;
  const m = Math.round(d / 30);
  return `hace ${m} ${m === 1 ? 'mes' : 'meses'}`;
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-CO', {
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Infiere una categoría humana ("Generador autodidacta", "Conector empático")
 * desde los rasgos dominantes. Heurística simple — el LLM podría hacerlo
 * mejor, pero esto es instantáneo y honesto sobre lo que hay.
 */
function inferCategory(profile: Profile | null): string {
  if (!profile) return 'Talento emergente';
  const traits = profile.traits.map((t) => t.toLowerCase()).join(' ');
  if (/autodid|aprend|curio/i.test(traits)) return 'Generador autodidacta';
  if (/iniciat|proactiv|resolv/i.test(traits)) return 'Resolvedor proactivo';
  if (/comuni|empat|client|atenc/i.test(traits)) return 'Conector empático';
  if (/persist|adapt|cambio/i.test(traits)) return 'Constructor metódico';
  if (/equipo|colabor|coord|lider/i.test(traits)) return 'Conector colaborativo';
  return 'Talento emergente';
}

/** ADN de 5 ejes — counts normalizados de lo que el perfil REALMENTE tiene. */
function computeRadar(
  profile: Profile | null,
  data: DashboardJovenData | null,
): { axis: string; value: number; raw: number; help: string }[] {
  if (!profile) return [];
  // Caps razonables para que llenar el radar sea posible pero no trivial.
  const cap = (raw: number, max: number) =>
    Math.min(100, Math.round((raw / max) * 100));

  const evidence = profile.evidence?.length ?? 0;
  const skills = profile.skills?.length ?? 0;
  const traits = profile.traits?.length ?? 0;
  const verified = data?.verifiedSkills.verified ?? 0;
  const microtasks = data?.earnings.completedCount ?? 0;

  return [
    { axis: 'Evidencia', value: cap(evidence, 10), raw: evidence, help: 'Citas textuales en tu perfil' },
    { axis: 'Skills', value: cap(skills, 15), raw: skills, help: 'Habilidades declaradas' },
    { axis: 'Verificación', value: data?.verifiedSkills.verifiedPct ?? 0, raw: verified, help: 'Skills con documento' },
    { axis: 'Rasgos', value: cap(traits, 10), raw: traits, help: 'Cómo trabajas' },
    { axis: 'Outcomes', value: cap(microtasks, 5), raw: microtasks, help: 'Microtasks completadas' },
  ];
}

/**
 * Pulso Score — score global 0-100 que resume todas las dimensiones.
 * Más alto = perfil más maduro y visible. Para el hero ring.
 */
function computePulse(
  profile: Profile | null,
  data: DashboardJovenData | null,
): number {
  if (!profile) return 0;
  const r = computeRadar(profile, data);
  if (r.length === 0) return 0;
  return Math.round(r.reduce((a, b) => a + b.value, 0) / r.length);
}

// ─── Componente principal ───────────────────────────────────────────────────

interface Props {
  uid: string;
  profileId: string;
  profile: Profile | null;
  tasks: MicroTask[];
  city?: string;
}

export function JovenWidgets({ uid, profileId, profile, tasks, city }: Props) {
  const { data, loading } = useDashboardData(uid);

  const radar = useMemo(() => computeRadar(profile, data), [profile, data]);
  const pulse = useMemo(() => computePulse(profile, data), [profile, data]);
  const category = useMemo(() => inferCategory(profile), [profile]);

  if (loading || !profile || !data) {
    return (
      <section className="space-y-5" aria-label="Tu pasaporte de talento">
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
    <section className="space-y-5" aria-label="Tu pasaporte de talento">

      {/* ─── HERO ────────────────────────────────────────────────────── */}
      <HeroDark
        avatarText={initials(profile.name)}
        name={profile.name}
        category={category}
        ringValue={pulse}
        ringLabel="Pulso laboral"
        statusText={`Última actividad: ${data.activityTimeline[0] ? formatAgo(data.activityTimeline[0].ts) : '—'}${city ? ` · ${city}` : ''}`}
        stats={[
          { icon: '🎯', label: 'Skills', value: String(profile.skills.length) },
          { icon: '💬', label: 'Evidencias', value: String(profile.evidence.length) },
          { icon: '💼', label: 'Microtasks', value: `${data.earnings.completedCount}` },
          { icon: '⭐', label: 'Rating', value: data.earnings.averageRating > 0 ? `${data.earnings.averageRating.toFixed(1)}/5` : '—' },
        ]}
      />

      {/* ─── Grid 3-col superior ─────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* ADN de talento */}
        <RadarCard
          title="ADN de talento"
          subtitle="Tu perfil en 5 ejes"
          axes={radar}
        />

        {/* Inversión / Earnings */}
        <EarningsCard
          totalCOP={data.earnings.totalCOP}
          completedCount={data.earnings.completedCount}
          pendingCount={data.earnings.pendingCount}
          avgRating={data.earnings.averageRating}
          tasks={tasks}
        />

        {/* Top oportunidades (flag rows) */}
        <OpportunitiesCard
          topOpportunity={data.topOpportunity}
          marketVisibility={data.marketVisibility}
          profileId={profileId}
        />
      </div>

      {/* ─── Grid 2x2 estilo de trabajo + Historial ──────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <StyleGrid
          tiles={inferStyleTiles(profile, data, tasks)}
          className="lg:col-span-2"
        />
        <HistoryCard tasks={tasks} timeline={data.activityTimeline} />
      </div>

      {/* ─── Inbox preview + Visibilidad de mercado ──────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        <InboxCard inbox={data.inboxSummary} profileId={profileId} />
        <MarketSkillsCard topSkills={data.marketVisibility.topSkillsInDemand} />
      </div>
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
  // Calculo color del badge match en base al pulse
  const matchPct = ringValue;
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950/40 text-white p-5 md:p-7">
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl" aria-hidden />
      <div className="relative flex flex-col md:flex-row md:items-center gap-5">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-display font-bold text-2xl md:text-3xl shadow-lg shadow-amber-900/40">
            {avatarText || '·'}
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-stone-950 flex items-center justify-center">
            <CheckCircle2 size={12} className="text-white" />
          </div>
        </div>

        {/* Identity + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h1 className="font-display font-bold text-2xl md:text-3xl tracking-tight">
              {name}
            </h1>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold shadow-sm">
              {category}
            </span>
            {matchPct >= 70 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-950/40 border border-amber-700/40 text-amber-300 text-xs font-semibold">
                Match {matchPct}%
              </span>
            )}
          </div>
          <p className="text-stone-400 text-sm">{statusText}</p>
          {/* Stat row */}
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

        {/* Ring score */}
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

// ─── RingScore SVG ───────────────────────────────────────────────────────────

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
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="url(#ringGradJoven)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="ringGradJoven" x1="0" y1="0" x2="1" y2="1">
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

// ─── RadarCard SVG ───────────────────────────────────────────────────────────

function RadarCard({
  title,
  subtitle,
  axes,
}: {
  title: string;
  subtitle: string;
  axes: { axis: string; value: number; raw: number; help: string }[];
}) {
  if (axes.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
        <SectionTitle title={title} />
        <p className="text-sm text-stone-500 mt-3">Cargá tu perfil para ver tu ADN.</p>
      </div>
    );
  }
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) - 14;
  const N = axes.length;

  const points = axes.map((a, i) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    const v = a.value / 100;
    return {
      x: cx + Math.cos(angle) * radius * v,
      y: cy + Math.sin(angle) * radius * v,
      labelX: cx + Math.cos(angle) * (radius + 8),
      labelY: cy + Math.sin(angle) * (radius + 8),
    };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];
  // Axis lines
  const axisLines = axes.map((_, i) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
        <svg width={size} height={size} className="flex-shrink-0">
          {/* Grid rings */}
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
          {/* Axis lines */}
          {axisLines.map((p, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="#e7e5e4"
              strokeWidth={1}
            />
          ))}
          {/* Filled polygon */}
          <polygon
            points={polygon}
            fill="rgba(234, 88, 12, 0.18)"
            stroke="#ea580c"
            strokeWidth={2}
          />
          {/* Vertices */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#ea580c" />
          ))}
          {/* Labels on axes */}
          {axes.map((a, i) => {
            const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
            const x = cx + Math.cos(angle) * (radius + 6);
            const y = cy + Math.sin(angle) * (radius + 6);
            // Anchor based on x position
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
        {/* Bars list */}
        <div className="flex-1 w-full space-y-2 min-w-0">
          {axes.map((a) => (
            <div key={a.axis} className="flex items-center gap-3 text-sm">
              <span className="text-stone-700 w-24 truncate text-xs">{a.axis}</span>
              <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${a.value}%` }}
                />
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

// ─── EarningsCard (presupuesto-like) ────────────────────────────────────────

function EarningsCard({
  totalCOP,
  completedCount,
  pendingCount,
  avgRating,
  tasks,
}: {
  totalCOP: number;
  completedCount: number;
  pendingCount: number;
  avgRating: number;
  tasks: MicroTask[];
}) {
  // Desglose por status
  const paidSum = tasks
    .filter((t) => t.status === 'paid')
    .reduce((a, t) => a + (t.amountCOP ?? 0), 0);
  const evaluatedSum = tasks
    .filter((t) => t.status === 'evaluated')
    .reduce((a, t) => a + (t.amountCOP ?? 0), 0);
  const deliveredSum = tasks
    .filter((t) => t.status === 'delivered')
    .reduce((a, t) => a + (t.amountCOP ?? 0), 0);
  const inProgressSum = tasks
    .filter((t) => t.status === 'pending' || t.status === 'in_progress')
    .reduce((a, t) => a + (t.amountCOP ?? 0), 0);

  const max = Math.max(1, paidSum, evaluatedSum, deliveredSum, inProgressSum);

  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Pagadas', value: paidSum, color: 'bg-emerald-500' },
    { label: 'Evaluadas', value: evaluatedSum, color: 'bg-emerald-400' },
    { label: 'Entregadas · pendientes', value: deliveredSum, color: 'bg-amber-400' },
    { label: 'En progreso', value: inProgressSum, color: 'bg-stone-300' },
  ];

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <SectionTitle title="Ingresos por microtasks" />
      <div className="mt-3">
        <div className="font-display font-bold text-4xl text-stone-900 tabular-nums leading-none">
          ${totalCOP.toLocaleString('es-CO')}
        </div>
        <div className="text-xs text-stone-500 mt-1">
          COP · {completedCount} {completedCount === 1 ? 'tarea cobrada' : 'tareas cobradas'}
          {avgRating > 0 && ` · rating ${avgRating.toFixed(1)}/5`}
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 text-sm">
            <span className="text-stone-700 flex-1 truncate text-xs">{r.label}</span>
            <div className="w-24 h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${r.color} transition-all`}
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
            <span className="font-mono tabular-nums text-xs font-semibold text-stone-900 w-16 text-right">
              ${r.value.toLocaleString('es-CO')}
            </span>
          </div>
        ))}
      </div>
      {(pendingCount > 0) && (
        <div className="mt-5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center gap-2 text-xs text-amber-900">
          <span>⏳</span>
          <span><strong>{pendingCount}</strong> tarea{pendingCount === 1 ? '' : 's'} en curso · acelerar la entrega libera más ingresos.</span>
        </div>
      )}
    </div>
  );
}

// ─── OpportunitiesCard (flag rows) ──────────────────────────────────────────

function OpportunitiesCard({
  topOpportunity,
  marketVisibility,
  profileId,
}: {
  topOpportunity: DashboardJovenData['topOpportunity'];
  marketVisibility: DashboardJovenData['marketVisibility'];
  profileId: string;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <SectionTitle title="Tus oportunidades" />
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-semibold">
          {marketVisibility.needsMatchingMySkills} detectadas
        </span>
      </div>

      {topOpportunity ? (
        <>
          <FlagBarRow
            emoji="🏢"
            label={topOpportunity.companyName}
            sublabel={topOpportunity.role}
            value={topOpportunity.approxIcs}
            badgeText="Top match"
            badgeTone="orange"
          />
          {/* Si hay más necesidades matching, mostramos las skills demandadas
              como proxy de oportunidades (cada skill demandada ≈ una abertura). */}
          {marketVisibility.topSkillsInDemand.slice(0, 4).map((s, i) => (
            <FlagBarRow
              key={s.skill}
              emoji={s.iHaveIt ? '✅' : '🎯'}
              label={s.skill}
              sublabel={`${s.demandedBy} ${s.demandedBy === 1 ? 'empresa' : 'empresas'} la piden`}
              value={s.iHaveIt ? Math.min(99, 60 + s.demandedBy * 5) : Math.min(70, 20 + s.demandedBy * 5)}
              badgeText={s.iHaveIt ? 'La tienes' : 'Aprenderla'}
              badgeTone={s.iHaveIt ? 'emerald' : 'amber'}
            />
          ))}
        </>
      ) : (
        <p className="text-sm text-stone-500 mt-3">
          Aún no detectamos matches fuertes. Cuando las empresas publiquen
          necesidades, aparecen acá ranked por compatibilidad.
        </p>
      )}

      <Link href={`/joven/conectar?profileId=${encodeURIComponent(profileId)}`}>
        <button className="mt-4 w-full text-xs text-orange-700 font-semibold hover:underline inline-flex items-center justify-center gap-1.5">
          Ver desglose ICS completo <ArrowRight size={11} />
        </button>
      </Link>
    </div>
  );
}

function FlagBarRow({
  emoji,
  label,
  sublabel,
  value,
  badgeText,
  badgeTone,
}: {
  emoji: string;
  label: string;
  sublabel?: string;
  value: number;
  badgeText?: string;
  badgeTone?: 'orange' | 'emerald' | 'amber' | 'slate';
}) {
  const badgeColor =
    badgeTone === 'orange'
      ? 'bg-orange-100 text-orange-700'
      : badgeTone === 'emerald'
        ? 'bg-emerald-100 text-emerald-700'
        : badgeTone === 'amber'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-stone-100 text-stone-600';
  return (
    <div className="mt-3 first:mt-3">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-lg leading-none flex-shrink-0">{emoji}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-stone-900 truncate">{label}</div>
            {sublabel && (
              <div className="text-[11px] text-stone-500 truncate">{sublabel}</div>
            )}
          </div>
        </div>
        {badgeText && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${badgeColor}`}>
            {badgeText}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all"
            style={{ width: `${value}%` }}
          />
        </div>
        <span className="text-[11px] font-mono tabular-nums font-bold text-stone-900 w-9 text-right">
          {value}%
        </span>
      </div>
    </div>
  );
}

// ─── StyleGrid 2x2 ──────────────────────────────────────────────────────────

interface StyleTile {
  emoji: string;
  label: string;
  value: string;
  hint: string;
}

function inferStyleTiles(
  profile: Profile,
  data: DashboardJovenData,
  tasks: MicroTask[],
): StyleTile[] {
  // Compañía: si tiene microtasks con varias empresas → "Multi-empresa",
  // si tiene 1 → "Foco en una empresa", si 0 → "Sin historial aún"
  const companies = new Set(tasks.map((t) => t.companyId).filter(Boolean));
  const compania: StyleTile = companies.size > 1
    ? { emoji: '🤝', label: 'Compañía', value: 'Multi-empresa', hint: `Trabajado con ${companies.size} empresas` }
    : companies.size === 1
      ? { emoji: '🤝', label: 'Compañía', value: 'Foco actual', hint: 'En una empresa hoy' }
      : { emoji: '🤝', label: 'Compañía', value: 'Disponible', hint: 'Listo para tu primer match' };

  // Ritmo: si hay microtasks pendientes → "Activo", si todas completas → "Constante", si ninguna → "Arrancando"
  const ritmo: StyleTile = data.earnings.pendingCount > 0
    ? { emoji: '⚡', label: 'Ritmo', value: 'Activo', hint: `${data.earnings.pendingCount} en curso ahora` }
    : data.earnings.completedCount > 0
      ? { emoji: '🎯', label: 'Ritmo', value: 'Constante', hint: `${data.earnings.completedCount} tareas cerradas` }
      : { emoji: '🌱', label: 'Ritmo', value: 'Arrancando', hint: 'Primera microtask en camino' };

  // Verificación: documentos subidos
  const verif: StyleTile = data.verifiedSkills.verifiedPct >= 50
    ? { emoji: '🛡️', label: 'Verificación', value: 'Alta', hint: `${data.verifiedSkills.verifiedPct}% de tus skills con documento` }
    : data.verifiedSkills.verifiedPct >= 20
      ? { emoji: '📄', label: 'Verificación', value: 'Parcial', hint: 'Súbe más certificados para subir' }
      : { emoji: '📄', label: 'Verificación', value: 'Por iniciar', hint: 'Súbe un diploma o certificado' };

  // Categoría dominante por traits
  const cat: StyleTile = {
    emoji: '🎓',
    label: 'Estilo',
    value: inferCategory(profile),
    hint: profile.traits.slice(0, 2).join(' · ') || 'Sin rasgos extraídos aún',
  };

  return [cat, compania, ritmo, verif];
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
      <SectionTitle title="Estilo de talento" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4"
          >
            <div className="text-3xl leading-none mb-3">{t.emoji}</div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
              {t.label}
            </div>
            <div className="font-display font-bold text-base text-stone-900 mt-0.5">
              {t.value}
            </div>
            <div className="text-[11px] text-stone-500 mt-1 leading-snug">
              {t.hint}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HistoryCard (timeline con estrellas) ──────────────────────────────────

function HistoryCard({
  tasks,
  timeline,
}: {
  tasks: MicroTask[];
  timeline: DashboardJovenData['activityTimeline'];
}) {
  // Priorizamos microtasks con rating (las que tienen estrellas → más visual).
  const ratedTasks = tasks
    .filter((t) => typeof t.companyRating === 'number' && t.evaluatedAt)
    .sort((a, b) => (b.evaluatedAt ?? 0) - (a.evaluatedAt ?? 0))
    .slice(0, 5);

  const showTimeline = ratedTasks.length === 0 && timeline.length > 0;

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <SectionTitle title="Historial" />
      <div className="mt-4 space-y-2.5">
        {ratedTasks.length > 0 ? (
          ratedTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center flex-shrink-0">
                <Briefcase size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-stone-900 truncate">
                  {t.title}
                </div>
                <div className="text-[11px] text-stone-500 truncate">
                  {t.companyName} · {t.evaluatedAt ? shortDate(t.evaluatedAt) : ''}
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={11}
                    className={
                      i < (t.companyRating ?? 0)
                        ? 'text-amber-500 fill-amber-500'
                        : 'text-stone-200 fill-transparent'
                    }
                  />
                ))}
              </div>
            </div>
          ))
        ) : showTimeline ? (
          timeline.slice(0, 5).map((e, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center flex-shrink-0">
                <Activity size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-800 leading-snug truncate">
                  {e.title}
                </div>
                <div className="text-[11px] text-stone-500 truncate">
                  {formatAgo(e.ts)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-stone-500">
            Sin actividad evaluada todavía. Cuando una empresa califique tu primera
            microtask, aparece acá con estrellas.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── InboxCard ──────────────────────────────────────────────────────────────

function InboxCard({
  inbox,
  profileId,
}: {
  inbox: DashboardJovenData['inboxSummary'];
  profileId: string;
}) {
  if (inbox.total === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
        <SectionTitle title="Inbox de feedback" />
        <p className="text-sm text-stone-500 mt-3 leading-relaxed">
          Cuando una empresa abra tu perfil y deje feedback (positivo o un descarte
          con razón), te aparece acá. Es feedback honesto que otras plataformas
          no te dan.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <SectionTitle title="Inbox de feedback" />
        {inbox.unreplied > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">
            {inbox.unreplied} sin responder
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniMetric emoji="⭐" label="Positivos" value={inbox.positiveFeedback} tone="emerald" />
        <MiniMetric emoji="🚪" label="Descartes" value={inbox.passReasons} tone="amber" />
        <MiniMetric emoji="✉️" label="Pendientes" value={inbox.unreplied} tone="slate" />
      </div>
      <Link href={`/joven/perfil/${profileId}`}>
        <button className="mt-4 w-full text-xs text-orange-700 font-semibold hover:underline inline-flex items-center justify-center gap-1.5">
          Abrir inbox completo <ArrowRight size={11} />
        </button>
      </Link>
    </div>
  );
}

function MiniMetric({
  emoji,
  label,
  value,
  tone,
}: {
  emoji: string;
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'slate';
}) {
  const bg =
    tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-200/60'
      : tone === 'amber'
        ? 'bg-amber-50 border-amber-200/60'
        : 'bg-stone-50 border-stone-200/60';
  return (
    <div className={`border rounded-2xl px-3 py-3 text-center ${bg}`}>
      <div className="text-xl leading-none">{emoji}</div>
      <div className="font-display font-bold text-2xl text-stone-900 tabular-nums mt-1.5">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mt-0.5">
        {label}
      </div>
    </div>
  );
}

// ─── MarketSkillsCard ──────────────────────────────────────────────────────

function MarketSkillsCard({
  topSkills,
}: {
  topSkills: DashboardJovenData['marketVisibility']['topSkillsInDemand'];
}) {
  if (topSkills.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
        <SectionTitle title="Skills más buscadas" />
        <p className="text-sm text-stone-500 mt-3">
          Aún no hay datos suficientes del mercado.
        </p>
      </div>
    );
  }
  const max = Math.max(...topSkills.map((s) => s.demandedBy));
  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6">
      <SectionTitle title="Skills más buscadas" subtitle="Demanda actual en el mercado" />
      <div className="mt-4 space-y-2.5">
        {topSkills.map((s) => (
          <div key={s.skill} className="flex items-center gap-3 text-sm">
            <span className="text-lg leading-none flex-shrink-0">
              {s.iHaveIt ? '✅' : '🎯'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-stone-900 truncate">{s.skill}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${s.iHaveIt ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    style={{ width: `${(s.demandedBy / max) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-stone-500 tabular-nums">
                  {s.demandedBy} {s.demandedBy === 1 ? 'empresa' : 'empresas'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SectionTitle ──────────────────────────────────────────────────────────

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-semibold">
        {title}
      </div>
      {subtitle && (
        <div className="text-xs text-stone-400 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}
