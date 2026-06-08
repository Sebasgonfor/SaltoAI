'use client';

import Link from 'next/link';
import {
  Eye,
  Briefcase,
  Send,
  CheckCircle2,
  MessageSquareQuote,
  Info,
  Activity,
  Network,
  Inbox,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useCachedResource } from '@/lib/hooks/use-cached-resource';
import type { DashboardJovenData } from '@/components/dashboard/joven-widgets';

type TimelineEvent = DashboardJovenData['activityTimeline'][number];

function formatAgo(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.round(hr / 24);
  if (d < 30) return `hace ${d} d`;
  const m = Math.round(d / 30);
  return `hace ${m} ${m === 1 ? 'mes' : 'meses'}`;
}

// Ícono + tono por tipo de evento. Sin emojis (siempre SVG).
function eventStyle(type: TimelineEvent['type']): { icon: LucideIcon; tone: string } {
  switch (type) {
    case 'profile_viewed':
      return { icon: Eye, tone: 'bg-slate-100 text-slate-600' };
    case 'microtask_proposed':
      return { icon: Briefcase, tone: 'bg-emerald-100 text-emerald-700' };
    case 'microtask_delivered':
      return { icon: Send, tone: 'bg-emerald-100 text-emerald-700' };
    case 'microtask_evaluated':
      return { icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700' };
    case 'feedback_received':
      return { icon: MessageSquareQuote, tone: 'bg-emerald-100 text-emerald-700' };
    case 'pass_reason':
      return { icon: Info, tone: 'bg-slate-100 text-slate-600' };
    default:
      return { icon: Activity, tone: 'bg-slate-100 text-slate-600' };
  }
}

/**
 * "Estado de tu candidatura" — privado del dueño. Responde la pregunta que más
 * ansiedad genera: ¿qué está pasando con mi perfil? Reúne lo que ya calcula
 * /api/dashboard/joven (timeline + visibilidad + mensajes) en una vista corta.
 * Caché propio (`candidacy_<uid>`) → instantáneo al re-entrar.
 */
export function CandidacyStatus({ uid, profileId }: { uid: string; profileId: string }) {
  const { data, loading } = useCachedResource<DashboardJovenData | null>(
    `candidacy_${uid}`,
    async () => {
      const res = await fetch(`/api/dashboard/joven?uid=${encodeURIComponent(uid)}`);
      if (!res.ok) return null;
      return (await res.json()) as DashboardJovenData;
    }
  );

  if (loading && !data) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-7 animate-pulse" aria-hidden>
        <div className="h-3 w-44 bg-emerald-100 rounded mb-4" />
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-2xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  const timeline = data?.activityTimeline ?? [];
  const oportunidades = data?.marketVisibility.needsMatchingMySkills ?? 0;
  const enCurso = data?.earnings.pendingCount ?? 0;
  const mensajes = data?.inboxSummary.total ?? 0;
  const events = timeline.slice(0, 4);

  const chips: { icon: LucideIcon; label: string; value: number }[] = [
    { icon: Network, label: 'Oportunidades detectadas', value: oportunidades },
    { icon: Briefcase, label: 'Tareas en curso', value: enCurso },
    { icon: Inbox, label: 'Mensajes de empresas', value: mensajes },
  ];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-7">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
            Estado de tu candidatura
          </div>
          <h2 className="font-display font-bold text-xl md:text-2xl text-slate-900 tracking-tight leading-tight">
            Qué está pasando con tu perfil
          </h2>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          En vivo
        </span>
      </div>

      {/* Cifras de actividad (no de contenido del perfil). */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 mb-5">
        {chips.map((c) => {
          const CIcon = c.icon;
          return (
            <div key={c.label} className="bg-white p-3 sm:p-4">
              <CIcon size={15} strokeWidth={1.9} className="text-slate-300 mb-2" />
              <div className="text-2xl font-display font-bold text-slate-900 tabular-nums leading-none">
                {c.value}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold leading-tight">
                {c.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline de actividad reciente. */}
      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
          <p className="text-sm text-slate-600 mb-3">
            Aún no hay movimiento en tu candidatura. Conéctate con empresas para empezar a aparecer
            en sus búsquedas.
          </p>
          <Link
            href={`/joven/conectar?profileId=${encodeURIComponent(profileId)}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            Ver oportunidades <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <ol className="space-y-3">
          {events.map((e, i) => {
            const { icon: EIcon, tone } = eventStyle(e.type);
            return (
              <li key={`${e.ts}-${i}`} className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>
                  <EIcon size={15} strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 leading-snug">{e.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {formatAgo(e.ts)}
                    {e.hint && <span className="text-slate-400"> · {e.hint}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
