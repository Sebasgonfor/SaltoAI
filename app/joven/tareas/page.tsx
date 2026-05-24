'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Briefcase,
  Clock,
  DollarSign,
  ArrowRight,
  Star,
  Trophy,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { MicroTask } from '@/lib/types';
import { RoleGate } from '@/components/auth/role-gate';
import { useAuth } from '@/lib/auth-context';
import { useJovenProfileId } from '@/lib/hooks/use-joven-profile-id';

const TASK_POLL_MS = 12_000;
const LS_PROFILE_KEY = 'salto_last_profile_id';

/**
 * Listado de micro-tareas del joven. Privado — solo el dueño debe verlo.
 *
 * Auto-carga con el profileId resuelto (uid vinculado o legacy en localStorage).
 * La empresa crea tareas con el profileId del match; buscamos también aliases
 * por si la tarea quedó en un id `local_*` previo al link.
 */
export default function TareasJovenPage() {
  return (
    <RoleGate role="joven">
      <TareasJoven />
    </RoleGate>
  );
}

function TareasJoven() {
  const { loading: authLoading } = useAuth();
  const resolvedProfileId = useJovenProfileId();
  const [tasks, setTasks] = useState<MicroTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);

  const loadTasks = useCallback(async (pid: string, opts?: { silent?: boolean }) => {
    if (!pid.trim()) return;
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LS_PROFILE_KEY);
    } catch {
      /* ignore */
    }
    const aliases = stored && stored !== pid.trim() ? [stored] : [];
    const params = new URLSearchParams({ profileId: pid.trim() });
    if (aliases.length > 0) params.set('aliases', aliases.join(','));
    try {
      const res = await fetch(`/api/microtask/list?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        if (!opts?.silent) {
          setError('No pudimos cargar tus tareas. Reintenta en un momento.');
          setTasks([]);
        }
        return;
      }
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setLastFetchAt(Date.now());
    } catch {
      if (!opts?.silent) {
        setError('Error de red.');
        setTasks([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !resolvedProfileId) return;
    void loadTasks(resolvedProfileId);
  }, [authLoading, resolvedProfileId, loadTasks]);

  useEffect(() => {
    if (!resolvedProfileId) return;

    const timer = window.setInterval(() => {
      void loadTasks(resolvedProfileId, { silent: true });
    }, TASK_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadTasks(resolvedProfileId, { silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [resolvedProfileId, loadTasks]);

  const active = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  const delivered = tasks.filter((t) => t.status === 'delivered');
  const completed = tasks.filter((t) => t.status === 'evaluated' || t.status === 'paid');

  if (authLoading || (loading && tasks.length === 0 && !error)) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="h-12 w-2/3 bg-slate-100 rounded animate-pulse" />
        <div className="h-6 w-1/2 bg-slate-100 rounded animate-pulse" />
        <div className="space-y-3 mt-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!resolvedProfileId) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <Sparkles size={32} className="text-emerald-600 mx-auto mb-4" />
        <h2 className="text-xl font-display font-bold text-slate-900 mb-3">
          Aún no tenés perfil
        </h2>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Completá tu entrevista para que las empresas puedan proponerte
          micro-tareas pagadas.
        </p>
        <Link href="/joven/chat">
          <Button>Empezar entrevista</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
              Mis micro-tareas
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-[1.05] mb-3">
              Trabajos reales, pagados, antes del primer contrato.
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
              Cada micro-tarea es ingresos reales para vos y evidencia
              verificada para tu perfil. Mejor que un CV.
              {active.length > 0 && (
                <span className="block mt-2 text-emerald-700 font-medium">
                  Tenés {active.length} tarea{active.length === 1 ? '' : 's'} activa
                  {active.length === 1 ? '' : 's'} — se actualiza sola cada pocos segundos.
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTasks(resolvedProfileId)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-700 disabled:opacity-50 flex-shrink-0 mt-2"
            title="Recargar lista"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Cargando…' : 'Recargar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {tasks.length === 0 && !loading && (
        <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-12 text-center">
          <Briefcase size={32} className="text-slate-400 mx-auto mb-4" />
          <h2 className="font-display font-semibold text-xl text-slate-900 mb-2">
            Sin micro-tareas todavía
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Cuando una empresa te proponga una tarea, te aparecerá aquí.
            Mientras tanto, asegurate de que tu Perfil de Evidencia esté
            completo para que más empresas te encuentren.
          </p>
          <div className="flex justify-center gap-3">
            <Link href={`/joven/perfil/${resolvedProfileId}`}>
              <Button variant="outline" size="sm">
                Ver mi perfil
              </Button>
            </Link>
            <Link href="/joven/conectar">
              <Button size="sm" className="gap-1.5">
                Ver oportunidades <ArrowRight size={12} />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display font-bold text-2xl text-slate-900">Activas</h2>
            <Badge className="bg-emerald-100 text-emerald-900 border-transparent">
              {active.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-4">
            {active.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </section>
      )}

      {delivered.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display font-bold text-2xl text-slate-900">
              Esperando evaluación
            </h2>
            <Badge className="bg-slate-200 text-slate-700 border-transparent">
              {delivered.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-4">
            {delivered.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-emerald-600" />
            <h2 className="font-display font-bold text-2xl text-slate-900">Completadas</h2>
            <Badge className="bg-emerald-100 text-emerald-900 border-transparent">
              {completed.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-4">
            {completed.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </section>
      )}

      {lastFetchAt && tasks.length > 0 && (
        <p className="text-[11px] text-slate-400 text-center">
          Actualizado {new Date(lastFetchAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}.
          Si una empresa te propone una tarea, dale a Recargar para verla al instante.
        </p>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: MicroTask }) {
  const statusStyle =
    task.status === 'pending' || task.status === 'in_progress'
      ? 'bg-emerald-100 text-emerald-800'
      : task.status === 'delivered'
        ? 'bg-slate-200 text-slate-700'
        : 'bg-emerald-100 text-emerald-800';
  const statusLabel =
    task.status === 'pending'
      ? 'Pendiente'
      : task.status === 'in_progress'
        ? 'En progreso'
        : task.status === 'delivered'
          ? 'Esperando empresa'
          : 'Evaluada';

  return (
    <Link href={`/joven/tareas/${task.id}`} className="block">
      <article className="bg-white border border-slate-200 hover:border-emerald-200 hover:shadow-sm rounded-2xl p-5 transition-colors flex items-start gap-4 cursor-pointer">
        <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <Briefcase size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-slate-900">{task.title}</h3>
            <Badge className={`${statusStyle} border-transparent text-xs`}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mb-2">Para {task.companyName}</p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <DollarSign size={12} className="text-emerald-600" />
              <strong>${task.amountCOP.toLocaleString('es-CO')}</strong> COP
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {task.deadlineHours}h para entregar
            </span>
            {task.companyRating && (
              <span className="flex items-center gap-1 text-emerald-600">
                <Star size={12} fill="currentColor" />
                <strong>{task.companyRating}/5</strong>
              </span>
            )}
          </div>
        </div>
        <ArrowRight size={16} className="text-slate-400 flex-shrink-0 mt-2" />
      </article>
    </Link>
  );
}
