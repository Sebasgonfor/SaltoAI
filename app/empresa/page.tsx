'use client';

/**
 * Dashboard del founder (`/empresa`) — la "casa" que faltaba.
 *
 * Hasta aquí el flujo empresa no tenía hub: el founder publicaba una necesidad,
 * caía en `/empresa/matches/{needId}` y desde ahí no había vuelta a la lista.
 * Este page resuelve eso reuniendo en una sola vista:
 *   - Saludo + estado de cuenta.
 *   - 4 KPIs (necesidades, candidatos viendo, tareas en curso, contrataciones).
 *   - Lista de necesidades publicadas con shortcut a sus matches.
 *   - Lista de micro-tareas activas con shortcut a su detalle.
 *
 * El chrome (header + nav) viene de `app/empresa/layout.tsx`. Este componente
 * solo renderiza contenido.
 */

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  DollarSign,
  Network,
  Sparkles,
  Star,
  Plus,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import type { CompanyNeed, MicroTask } from '@/lib/types';
import { LegalEditor } from '@/components/empresa/legal-editor';
import { EmpresaWidgets } from '@/components/dashboard/empresa-widgets';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// ─── helpers ──────────────────────────────────────────────────────────────────

function getGreeting(name: string) {
  const h = new Date().getHours();
  const prefix = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  return `${prefix}, ${name}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCOP(n: number): string {
  return `$${n.toLocaleString('es-CO')}`;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  value,
  label,
  hint,
  tone = 'neutral',
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  hint?: string;
  tone?: 'neutral' | 'emerald' | 'amber';
}) {
  const tones = {
    neutral: 'bg-white border-slate-200',
    emerald: 'bg-emerald-50/60 border-emerald-200/60',
    amber: 'bg-amber-50/60 border-amber-200/60',
  };
  const iconTones = {
    neutral: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
  };
  return (
    <div className={`rounded-2xl border p-5 flex flex-col ${tones[tone]}`}>
      <div className="flex items-center justify-between mb-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconTones[tone]}`}
        >
          <Icon size={16} strokeWidth={1.75} />
        </div>
      </div>
      <div className="font-display font-bold text-2xl sm:text-3xl text-slate-900 tabular-nums leading-none">
        {value}
      </div>
      <div className="text-sm text-slate-700 font-medium mt-1">{label}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1.5 leading-snug">{hint}</div>}
    </div>
  );
}

function NeedCard({ need }: { need: CompanyNeed }) {
  const isLegal = !!need.legal;
  return (
    <Link href={`/empresa/matches/${need.id}`}>
      <div className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
              {need.companyName}
            </div>
            <h3 className="font-display font-semibold text-lg text-slate-900 leading-tight">
              {need.role || 'Necesidad sin título'}
            </h3>
          </div>
          <ArrowRight
            size={16}
            className="text-slate-300 group-hover:text-emerald-600 transition-colors flex-shrink-0 mt-1"
          />
        </div>

        {need.context && (
          <p className="text-xs text-slate-600 leading-relaxed mb-3 line-clamp-2">
            {need.context}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 mb-3">
          {need.requiredSkills.slice(0, 4).map((s) => (
            <Badge
              key={s}
              variant="secondary"
              className="bg-slate-100 text-slate-700 border-transparent text-[10.5px] font-normal"
            >
              {s}
            </Badge>
          ))}
          {need.requiredSkills.length > 4 && (
            <span className="text-[10.5px] text-slate-500 self-center">
              +{need.requiredSkills.length - 4}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
          <span className="text-slate-500">Publicada {formatDate(need.createdAt)}</span>
          {isLegal ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <ShieldCheck size={12} /> Legal validada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertCircle size={12} /> Sin datos legales
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function TaskRow({ task }: { task: MicroTask }) {
  const statusMap: Record<MicroTask['status'], { label: string; cls: string; tone: 'amber' | 'blue' | 'emerald' | 'slate' }> = {
    pending: { label: 'Esperando entrega', cls: 'bg-amber-100 text-amber-800', tone: 'amber' },
    in_progress: { label: 'En progreso', cls: 'bg-blue-100 text-blue-800', tone: 'blue' },
    delivered: { label: 'Lista para evaluar', cls: 'bg-emerald-100 text-emerald-800', tone: 'emerald' },
    evaluated: { label: 'Evaluada', cls: 'bg-slate-200 text-slate-700', tone: 'slate' },
    paid: { label: 'Pagada', cls: 'bg-emerald-100 text-emerald-800', tone: 'emerald' },
  };
  const { label, cls } = statusMap[task.status] ?? { label: task.status, cls: 'bg-slate-100 text-slate-700' };
  const urgent = task.status === 'delivered'; // empresa debe evaluar

  return (
    <Link href={`/empresa/tareas/${task.id}`}>
      <div className="flex items-start gap-3 p-3.5 rounded-xl hover:bg-slate-50 transition-colors group border border-transparent hover:border-slate-200">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            urgent ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300/40' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <Briefcase size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-900 leading-snug truncate">
              {task.title}
            </p>
            <Badge className={`${cls} border-transparent text-[10px] flex-shrink-0`}>{label}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Candidato: <span className="text-slate-700">{task.profileName}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <DollarSign size={11} className="text-emerald-600" />
              {formatCOP(task.amountCOP)} COP
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {task.deadlineHours}h deadline
            </span>
            {task.companyRating && (
              <span className="flex items-center gap-1 text-amber-600">
                <Star size={11} fill="currentColor" />
                {task.companyRating}/5
              </span>
            )}
          </div>
        </div>
        <ArrowRight
          size={14}
          className="text-slate-300 group-hover:text-slate-600 transition-colors flex-shrink-0 mt-1"
        />
      </div>
    </Link>
  );
}

function SectionHeader({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display font-bold text-xl text-slate-900 tracking-tight">{title}</h2>
          {typeof count === 'number' && (
            <span className="text-sm text-slate-500 tabular-nums">({count})</span>
          )}
        </div>
        {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function EmpresaDashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [needs, setNeeds] = useState<CompanyNeed[]>([]);
  const [tasks, setTasks] = useState<MicroTask[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        // Legacy: tareas creadas antes del fix usaban un companyId random
        // de localStorage. Si todavía existe, lo consultamos en paralelo
        // y mergeamos resultados — así no se pierden las histórias del
        // demo. (Cuando todo lo nuevo sea con user.uid, esto queda inerte.)
        let legacyCompanyId: string | null = null;
        try {
          legacyCompanyId = localStorage.getItem('salto_company_id');
        } catch {
          /* SSR-safe */
        }
        const taskRequests: Promise<Response>[] = [
          fetch(`/api/microtask/list?companyId=${encodeURIComponent(user.uid)}`),
        ];
        if (legacyCompanyId && legacyCompanyId !== user.uid) {
          taskRequests.push(
            fetch(`/api/microtask/list?companyId=${encodeURIComponent(legacyCompanyId)}`),
          );
        }
        const [needsRes, ...tasksResponses] = await Promise.all([
          fetch(`/api/necesidad/mias?uid=${encodeURIComponent(user.uid)}`),
          ...taskRequests,
        ]);
        if (!cancelled && needsRes.ok) {
          const d = await needsRes.json();
          setNeeds(Array.isArray(d.needs) ? d.needs : []);
        }
        // Merge de las tasks: por id, conservando la más reciente.
        if (!cancelled) {
          const allTasks = new Map<string, MicroTask>();
          for (const tr of tasksResponses) {
            if (!tr.ok) continue;
            const d = await tr.json();
            if (!Array.isArray(d.tasks)) continue;
            for (const t of d.tasks as MicroTask[]) {
              if (t.id) allTasks.set(t.id, t);
            }
          }
          const merged = Array.from(allTasks.values()).sort(
            (a, b) => b.createdAt - a.createdAt,
          );
          setTasks(merged);
        }
      } catch {
        /* silent: empty state se ocupa */
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // KPIs derivados
  const kpis = useMemo(() => {
    const activeTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
    const pendingEvaluations = tasks.filter((t) => t.status === 'delivered');
    const closed = tasks.filter((t) => t.status === 'evaluated' || t.status === 'paid');
    return {
      needsCount: needs.length,
      activeTasks: activeTasks.length,
      pendingEvaluations: pendingEvaluations.length,
      closed: closed.length,
    };
  }, [needs, tasks]);

  // Activas + delivered van arriba; evaluadas/pagadas no llenan el dashboard
  const visibleTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const order: Record<MicroTask['status'], number> = {
          delivered: 0,
          pending: 1,
          in_progress: 2,
          evaluated: 3,
          paid: 4,
        };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      }),
    [tasks]
  );

  if (loading || !user) {
    return <LoadingSpinner variant="full" label="Cargando tu sesión…" />;
  }

  const firstName = user.displayName?.split(' ')[0] || 'fundador/a';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 sm:space-y-10 w-full">
      {/* Greeting */}
      <header>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Tu mesa de trabajo
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
          {getGreeting(firstName)}
        </h1>
        <p className="text-slate-600 mt-2 max-w-2xl">
          Aquí ves todas tus necesidades publicadas, los candidatos en evaluación y las micro-tareas
          en curso. Calidad sobre volumen — 10 candidatos por necesidad, no 200 CVs.
        </p>
      </header>

      {user?.uid && <LegalEditor uid={user.uid} />}

      {/* KPIs base — operacional. Las activas/por-evaluar/cerradas son las que
          el founder mira primero para saber QUÉ está pendiente HOY. */}
      <section className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Layers}
          value={kpis.needsCount}
          label="Necesidades"
          hint="Publicadas por tú"
          tone="emerald"
        />
        <KpiCard
          icon={Briefcase}
          value={kpis.activeTasks}
          label="Tareas en curso"
          hint="Esperando entrega del joven"
        />
        <KpiCard
          icon={Clock}
          value={kpis.pendingEvaluations}
          label="Por evaluar"
          hint={kpis.pendingEvaluations > 0 ? 'Tienen entrega — pendiente tu rating' : 'Sin pendientes'}
          tone={kpis.pendingEvaluations > 0 ? 'amber' : 'neutral'}
        />
        <KpiCard
          icon={CheckCircle2}
          value={kpis.closed}
          label="Cerradas"
          hint="Evaluadas + pagadas"
        />
      </section>

      {/* Widgets enriquecidos — pasaporte visual del founder: hero dark +
          ADN de búsqueda (radar) + inversión + top candidatos + pipeline
          funnel + estilo founder + salud por necesidad + calibración. Una
          sola request al endpoint. */}
      <EmpresaWidgets
        uid={user.uid}
        companyName={
          needs[0]?.companyName ||
          user.displayName ||
          (user.email ? user.email.split('@')[0] : 'Mi empresa')
        }
        needs={needs}
        tasks={tasks}
      />

      {/* CTA + lista de necesidades */}
      <section>
        <SectionHeader
          title="Mis necesidades"
          count={needs.length}
          hint="Cada una con su shortlist de hasta 10 candidatos ranked por ICS."
        />

        {dataLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <LoadingSpinner variant="block" label="Cargando necesidades…" />
          </div>
        ) : needs.length === 0 ? (
          <div className="bg-gradient-to-br from-emerald-50/40 via-white to-amber-50/30 border border-emerald-200/40 rounded-2xl p-10 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Sparkles size={22} strokeWidth={1.75} />
            </div>
            <h3 className="font-display font-bold text-xl text-slate-900 mb-2 tracking-tight">
              Cuéntanos tu primera necesidad.
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-6">
              No tienes que escribir un job description perfecto. Cuentas en lenguaje natural qué te
              hace falta y la IA estructura el rol, el contexto y los rasgos que exige.
            </p>
            <div className="flex justify-center">
              <Link href="/empresa/chat">
                <Button className="gap-2">
                  <Plus size={14} /> Publicar necesidad con IA
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              {needs.map((n) => (
                <NeedCard key={n.id} need={n} />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Link href="/empresa/chat">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Plus size={14} /> Publicar nueva necesidad
                </Button>
              </Link>
            </div>
          </>
        )}
      </section>

      {/* Tareas activas */}
      <section>
        <SectionHeader
          title="Micro-tareas"
          count={tasks.length}
          hint="Audiciones pagadas — el outcome alimenta el ICS del candidato y tu data flywheel."
        />

        {dataLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <LoadingSpinner variant="block" label="Cargando tareas…" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <Briefcase size={20} strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Sin micro-tareas activas
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Cuando entres a un match y propongas una tarea pagada para validar al candidato,
              aparece aquí. Es lo que reemplaza la "entrevista clásica" — pagás por evidencia real,
              no por una conversación.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-1">
            {visibleTasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      {/* Bottom strip — recordatorio del principio Salto */}
      <section className="bg-slate-950 text-white rounded-2xl p-5 sm:p-7 md:p-9 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/15 rounded-full blur-3xl" aria-hidden />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Network size={14} className="text-emerald-400" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold">
                Filosofía Salto
              </span>
            </div>
            <h3 className="font-display font-bold text-xl md:text-2xl tracking-tight leading-tight max-w-2xl">
              Calidad, no volumen. 10 candidatos con evidencia, no 200 CVs sin contexto.
            </h3>
          </div>
          <Link href="/empresa/chat">
            <Button className="bg-white text-slate-900 hover:bg-slate-100 gap-2">
              Publicar necesidad <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
