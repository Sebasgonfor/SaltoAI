'use client';

/**
 * Widgets enriquecidos del dashboard del joven (`/dashboard`).
 *
 * Consume `/api/dashboard/joven?uid=X` (un solo request). Muestra cosas que
 * NINGÚN producto le da al joven:
 *
 *   - Earnings (cuánto ganó en microtasks)
 *   - Visibilidad de mercado (cuántas empresas piden tus skills)
 *   - Inbox de feedback recibido
 *   - Skills verificadas por documento vs declaradas
 *   - Top opportunity preview
 *   - Activity timeline (eventos sobre vos en el producto)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign,
  Star,
  Eye,
  ShieldCheck,
  TrendingUp,
  MessageSquareQuote,
  Briefcase,
  Activity,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ThumbsDown,
  Inbox,
  Building2,
  Clock,
  Send,
} from 'lucide-react';

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

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function useDashboardData(uid: string | undefined) {
  const [data, setData] = useState<DashboardJovenData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/joven?uid=${encodeURIComponent(uid)}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as DashboardJovenData;
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

export function JovenWidgets({ uid, profileId }: { uid: string; profileId: string }) {
  const { data, loading } = useDashboardData(uid);

  if (loading) {
    return (
      <section className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </section>
    );
  }
  if (!data) return null;

  return (
    <section className="space-y-5" aria-label="Métricas enriquecidas del joven">
      {/* ── Hero strip: earnings + visibilidad + rating + skills verif ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<DollarSign size={14} />}
          label="Ganado COP"
          value={`$${(data.earnings.totalCOP / 1000).toFixed(0)}k`}
          hint={`${data.earnings.completedCount} microtasks pagadas`}
          tone={data.earnings.totalCOP > 0 ? 'good' : 'neutral'}
        />
        <KpiCard
          icon={<Star size={14} />}
          label="Rating promedio"
          value={data.earnings.averageRating > 0 ? data.earnings.averageRating.toFixed(1) : '—'}
          unit={data.earnings.averageRating > 0 ? '/ 5' : undefined}
          hint={data.earnings.averageRating > 0 ? 'En microtasks evaluadas' : 'Sin evaluaciones aún'}
          tone={data.earnings.averageRating >= 4 ? 'good' : data.earnings.averageRating >= 3 ? 'warn' : 'neutral'}
        />
        <KpiCard
          icon={<ShieldCheck size={14} />}
          label="Skills verificadas"
          value={`${data.verifiedSkills.verified}/${data.verifiedSkills.declared}`}
          hint={
            data.verifiedSkills.verifiedPct > 0
              ? `${data.verifiedSkills.verifiedPct}% con documento`
              : 'Sube certificados para verificar'
          }
          tone={data.verifiedSkills.verifiedPct >= 50 ? 'good' : 'neutral'}
        />
        <KpiCard
          icon={<Inbox size={14} />}
          label="Inbox"
          value={data.inboxSummary.total}
          hint={
            data.inboxSummary.unreplied > 0
              ? `${data.inboxSummary.unreplied} sin responder`
              : 'Todo respondido'
          }
          tone={data.inboxSummary.unreplied > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {/* ── Visibilidad de mercado + Top opportunity ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <MarketVisibilityWidget visibility={data.marketVisibility} />
        <TopOpportunityWidget opportunity={data.topOpportunity} profileId={profileId} />
      </div>

      {/* ── Inbox preview + Activity timeline ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <InboxPreviewWidget inbox={data.inboxSummary} profileId={profileId} />
        <ActivityTimelineWidget timeline={data.activityTimeline} />
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
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const color =
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
      <div className={`font-display font-bold text-2xl md:text-3xl tabular-nums leading-none ${color}`}>
        {value}
        {unit && <span className="text-sm font-semibold ml-0.5">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">{hint}</div>}
    </div>
  );
}

// ─── MarketVisibilityWidget ─────────────────────────────────────────────────

function MarketVisibilityWidget({
  visibility,
}: {
  visibility: DashboardJovenData['marketVisibility'];
}) {
  const matchPct =
    visibility.totalActiveNeeds === 0
      ? 0
      : Math.round(
          (visibility.needsMatchingMySkills / visibility.totalActiveNeeds) * 100,
        );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <Eye size={12} className="text-emerald-600" />
        Visibilidad en el mercado
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">
        ¿Cuántas empresas te pueden encontrar?
      </h3>
      <p className="text-xs text-slate-500 mb-5 leading-relaxed">
        Necesidades activas que piden alguna de tus skills declaradas.
      </p>

      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-display font-bold text-5xl text-emerald-600 tabular-nums leading-none">
          {visibility.needsMatchingMySkills}
        </span>
        <span className="text-sm text-slate-500">
          de {visibility.totalActiveNeeds} activas
        </span>
        <span className="ml-auto text-xs tabular-nums font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
          {matchPct}%
        </span>
      </div>

      {visibility.topSkillsInDemand.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Skills más demandadas
          </div>
          <div className="space-y-1.5">
            {visibility.topSkillsInDemand.map((s) => (
              <div
                key={s.skill}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-100 bg-slate-50/40"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {s.iHaveIt ? (
                    <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0" />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0" />
                  )}
                  <span className="text-sm text-slate-800 truncate">{s.skill}</span>
                </div>
                <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0">
                  {s.demandedBy} {s.demandedBy === 1 ? 'empresa' : 'empresas'}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
            Las skills sin tilde verde no aparecen en tu perfil — considerá
            agregarlas si las tenés (entrevista o documento).
          </p>
        </>
      )}
    </div>
  );
}

// ─── TopOpportunityWidget ──────────────────────────────────────────────────

function TopOpportunityWidget({
  opportunity,
  profileId,
}: {
  opportunity: DashboardJovenData['topOpportunity'];
  profileId: string;
}) {
  if (!opportunity) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
          <Sparkles size={12} className="text-emerald-600" />
          Tu mejor oportunidad
        </div>
        <p className="text-sm text-slate-500 mt-3 leading-relaxed">
          Aún no detectamos un match fuerte. A medida que las empresas publiquen
          necesidades, vas a ver acá la mejor del día.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-gradient-to-br from-emerald-50 via-white to-amber-50/30 border border-emerald-200/60 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">
        <Sparkles size={12} />
        Tu mejor oportunidad ahora
      </div>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-xl text-slate-900 leading-tight">
            {opportunity.companyName}
          </h3>
          <p className="text-sm text-slate-700 mt-0.5 truncate">{opportunity.role}</p>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="font-display font-bold text-3xl text-emerald-600 tabular-nums leading-none">
            {opportunity.approxIcs}%
          </span>
          <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mt-1">
            match aprox
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        Estimación rápida basada en overlap de skills. El ICS real con desglose
        completo lo calcula el motor cuando entres a oportunidades.
      </p>
      <Link href={`/joven/conectar?profileId=${encodeURIComponent(profileId)}`}>
        <Button size="sm" className="gap-2 w-full">
          Ver desglose ICS y conectar <ArrowRight size={13} />
        </Button>
      </Link>
    </div>
  );
}

// ─── InboxPreviewWidget ────────────────────────────────────────────────────

function InboxPreviewWidget({
  inbox,
  profileId,
}: {
  inbox: DashboardJovenData['inboxSummary'];
  profileId: string;
}) {
  if (inbox.total === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
          <MessageSquareQuote size={12} className="text-emerald-600" />
          Tu inbox de feedback
        </div>
        <p className="text-sm text-slate-500 mt-3 leading-relaxed">
          Cuando una empresa abra tu perfil y deje feedback (positivo o un &ldquo;no
          avanzo&rdquo;), te aparece acá. Es feedback honesto que en otras
          plataformas no te dan.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        <MessageSquareQuote size={12} className="text-emerald-600" />
        Tu inbox de feedback
      </div>
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-4">
        {inbox.unreplied > 0
          ? `Tenés ${inbox.unreplied} sin responder.`
          : 'Estás al día.'}
      </h3>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <MiniStat
          icon={<Star size={11} fill="currentColor" />}
          tone="emerald"
          label="Positivos"
          value={inbox.positiveFeedback}
        />
        <MiniStat
          icon={<ThumbsDown size={11} />}
          tone="amber"
          label="Descartes"
          value={inbox.passReasons}
        />
        <MiniStat
          icon={<Send size={11} />}
          tone="slate"
          label="Sin responder"
          value={inbox.unreplied}
        />
      </div>

      <Link href={`/joven/perfil/${profileId}`}>
        <Button variant="outline" size="sm" className="gap-2 w-full">
          Ver inbox completo <ArrowRight size={12} />
        </Button>
      </Link>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'slate';
}) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
      : tone === 'amber'
        ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-slate-700 bg-slate-50 border-slate-200';
  return (
    <div className={`border rounded-xl p-3 ${color}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
        {icon}
        {label}
      </div>
      <div className="font-display font-bold text-xl tabular-nums">{value}</div>
    </div>
  );
}

// ─── ActivityTimelineWidget ────────────────────────────────────────────────

const TIMELINE_ICONS: Record<
  DashboardJovenData['activityTimeline'][number]['type'],
  { icon: React.ReactNode; color: string }
> = {
  microtask_proposed: {
    icon: <Briefcase size={11} />,
    color: 'bg-amber-100 text-amber-700',
  },
  microtask_delivered: {
    icon: <Send size={11} />,
    color: 'bg-emerald-100 text-emerald-700',
  },
  microtask_evaluated: {
    icon: <Star size={11} fill="currentColor" />,
    color: 'bg-amber-100 text-amber-700',
  },
  feedback_received: {
    icon: <MessageSquareQuote size={11} />,
    color: 'bg-emerald-100 text-emerald-700',
  },
  pass_reason: {
    icon: <ThumbsDown size={11} />,
    color: 'bg-slate-100 text-slate-600',
  },
  profile_viewed: {
    icon: <Eye size={11} />,
    color: 'bg-slate-100 text-slate-600',
  },
};

function ActivityTimelineWidget({
  timeline,
}: {
  timeline: DashboardJovenData['activityTimeline'];
}) {
  return (
    <div className="bg-slate-950 text-white rounded-2xl p-5 md:p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300 font-semibold mb-1">
          <Activity size={12} />
          Tu actividad reciente
        </div>
        <h3 className="font-display font-semibold text-lg text-white mb-4">
          {timeline.length === 0
            ? 'Aún no hay actividad'
            : 'Qué pasó alrededor de tu perfil'}
        </h3>

        {timeline.length === 0 ? (
          <p className="text-sm text-slate-300 leading-relaxed">
            Cuando una empresa abra tu perfil, te proponga una microtask o te
            deje feedback, lo vas a ver acá como un feed.
          </p>
        ) : (
          <div className="space-y-2.5">
            {timeline.map((e, i) => {
              const meta = TIMELINE_ICONS[e.type];
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900/40"
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}
                  >
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white leading-snug">{e.title}</div>
                    {e.hint && (
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {e.hint}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 tabular-nums flex-shrink-0 mt-1">
                    {formatAgo(e.ts)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
