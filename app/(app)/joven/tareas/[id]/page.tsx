'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Briefcase,
  Clock,
  DollarSign,
  Target,
  ListChecks,
  CheckCircle2,
  Star,
  AlertTriangle,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import type { MicroTask } from '@/lib/types';
import { RoleGate } from '@/components/auth/role-gate';
import { FeedbackInlinePrompt } from '@/components/feedback/inline-prompt';

/**
 * Detalle de micro-tarea del joven. Privado — solo el dueño puede entregar
 * y ver la evaluación. RoleGate movido del layout a esta page.
 */
export default function TareaDetalleJovenPage(props: { params: Promise<{ id: string }> }) {
  return (
    <RoleGate role="joven">
      <TareaDetalleJoven {...props} />
    </RoleGate>
  );
}

function TareaDetalleJoven({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [task, setTask] = useState<MicroTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deliverable, setDeliverable] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/microtask/proponer?id=${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json();
          setTask(data.task);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const entregar = async () => {
    if (!deliverable.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/microtask/entregar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id, deliverable: deliverable.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error entregando');
        setSubmitting(false);
        return;
      }
      setTask(data.task);
    } catch (e) {
      setError('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto px-6 py-24 text-center text-slate-500">Cargando…</div>;
  }
  if (!task) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <h2 className="text-xl font-display font-medium mb-4">Tarea no encontrada</h2>
        <Link href="/joven/tareas">
          <Button>Volver</Button>
        </Link>
      </div>
    );
  }

  const isPending = task.status === 'pending' || task.status === 'in_progress';
  const isDelivered = task.status === 'delivered';
  const isEvaluated = task.status === 'evaluated' || task.status === 'paid';

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2 -ml-2">
        <ArrowLeft size={14} /> Volver
      </Button>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {isPending && (
            <Badge className="bg-emerald-100 text-emerald-800 border-transparent">Pendiente de tu entrega</Badge>
          )}
          {isDelivered && (
            <Badge className="bg-slate-200 text-slate-700 border-transparent">Esperando evaluación de la empresa</Badge>
          )}
          {isEvaluated && (
            <Badge className="bg-emerald-100 text-emerald-800 border-transparent">
              <CheckCircle2 size={12} className="mr-1" />
              Evaluada
            </Badge>
          )}
          <Badge variant="outline" className="border-slate-200 text-slate-600">
            Para {task.companyName}
          </Badge>
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-[1.05]">
          {task.title}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <span className="flex items-center gap-1.5">
            <DollarSign size={14} className="text-emerald-600" />
            <strong className="text-emerald-700">${task.amountCOP.toLocaleString('es-CO')} COP</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={14} className="text-slate-500" />
            {task.deadlineHours}h para entregar
          </span>
        </div>
      </header>

      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">Brief</div>
          <p className="text-slate-800 leading-relaxed">{task.brief}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <Target size={11} /> Qué tienes que entregar
          </div>
          <p className="text-slate-800 leading-relaxed">{task.expectedDeliverable}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <ListChecks size={11} /> Cómo te van a evaluar
          </div>
          <div className="space-y-2">
            {task.criteria.map((c, i) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="font-semibold text-sm text-slate-900 mb-0.5">{c.name}</div>
                <div className="text-xs text-slate-600">{c.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feedback de claridad de la consigna — disparado solo en estado
          pending. El joven nos dice si entendió qué tiene que entregar
          ANTES de empezar (ground-truth para mejorar cómo redactamos
          tareas: brief + expectedDeliverable + criteria). */}
      {isPending && (
        <FeedbackInlinePrompt
          question="¿La tarea está clara? ¿Sabés qué tenés que entregar?"
          hint="Si la consigna se ve confusa, lo arreglamos antes de que pierdas tiempo."
          variant="thumbs"
          touchpoint="microtask_clarity"
          targetType="microtask"
          targetId={id}
          dismissible
        />
      )}

      {/* Form de entrega */}
      {isPending && (
        <section className="bg-emerald-50/40 border border-emerald-200 rounded-2xl p-6 md:p-8">
          <h2 className="font-display font-bold text-xl text-slate-900 mb-1">Tu entrega</h2>
          <p className="text-sm text-slate-600 mb-4">
            Puedes pegar tu trabajo directamente, o un link a Google Drive / Notion / lo que uses. Sé concreto y muestra tu razonamiento si vale la pena.
          </p>
          <Textarea
            placeholder="Pega tu entregable aquí. Si es un archivo externo, incluye el link y un resumen corto."
            className="min-h-40 bg-white text-[15px] leading-relaxed"
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            disabled={submitting}
          />
          {error && (
            <div className="mt-3 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              onClick={entregar}
              disabled={submitting || !deliverable.trim()}
              size="lg"
              className="gap-2"
            >
              {submitting ? 'Procesando…' : (
                <>
                  <Sparkles size={16} /> Entregar y dejar que la IA pre-evalúe
                </>
              )}
            </Button>
          </div>
        </section>
      )}

      {/* Entregable enviado */}
      {(isDelivered || isEvaluated) && task.deliverable && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-3">
            Lo que entregaste
          </div>
          <pre className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">{task.deliverable}</pre>
        </section>
      )}

      {/* Pre-evaluación IA */}
      {(isDelivered || isEvaluated) && task.aiEvaluation && (
        <section className="bg-slate-950 text-white rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-emerald-400" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold">Pre-evaluación de SaltoAI</span>
          </div>
          <div className="flex items-baseline gap-3 mb-5">
            <span className="font-display font-bold text-6xl text-emerald-400 tabular-nums leading-none">
              {task.aiEvaluation.overallScore}
            </span>
            <span className="text-2xl text-emerald-400 font-display font-bold">/100</span>
          </div>
          <p className="text-slate-200 leading-relaxed mb-6">{task.aiEvaluation.overallComment}</p>
          <div className="space-y-2">
            {task.aiEvaluation.criteriaScores.map((s, i) => (
              <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-white">{s.name}</span>
                  <span className="font-mono tabular-nums text-emerald-400 font-bold">{s.score}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{s.comment}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Evaluación final empresa */}
      {isEvaluated && (
        <section className="bg-emerald-50/40 border border-emerald-200 rounded-2xl p-6 md:p-8">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-800 font-semibold mb-3">Evaluación final de la empresa</div>
          <div className="flex items-center gap-2 mb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={24}
                fill={i < (task.companyRating ?? 0) ? '#d97706' : 'none'}
                className="text-emerald-600"
                strokeWidth={1.5}
              />
            ))}
            <span className="text-2xl font-display font-bold text-emerald-700 ml-2">
              {task.companyRating}/5
            </span>
          </div>
          {task.companyComment && (
            <blockquote className="text-slate-800 italic leading-relaxed border-l-2 border-emerald-300 pl-4">
              "{task.companyComment}"
            </blockquote>
          )}
          <div className="mt-5 pt-5 border-t border-emerald-200 text-xs text-emerald-900 leading-relaxed">
            Esta evaluación ya está en tu Perfil de Evidencia como outcome verificado. Las próximas empresas la van a ver.
          </div>
          {/* Justicia percibida: el joven nos dice si la nota refleja su
              trabajo. Si vemos muchos "no" sistemáticos contra una empresa,
              es señal de que el founder está siendo demasiado duro (riesgo
              de sesgo de evaluación). No es dismissible — queremos cerrar
              el loop incluso en disputas. */}
          <div className="mt-5 pt-5 border-t border-emerald-200">
            <FeedbackInlinePrompt
              question="¿Sentís que la evaluación fue justa?"
              hint="Si no, anotamos la disputa. La empresa no ve tu voto."
              variant="thumbs"
              touchpoint="microtask_evaluation"
              targetType="microtask"
              targetId={id}
              dismissible={false}
            />
          </div>
        </section>
      )}
    </div>
  );
}
