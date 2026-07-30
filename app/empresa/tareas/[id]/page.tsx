'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Clock,
  DollarSign,
  Target,
  ListChecks,
  CheckCircle2,
  Star,
  AlertTriangle,
  Sparkles,
  ArrowLeft,
  User,
} from 'lucide-react';
import type { MicroTask } from '@/lib/types';
import { FeedbackInlinePrompt } from '@/components/feedback/inline-prompt';
import { emitSignal } from '@/lib/feedback';

export default function TareaDetalleEmpresa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [task, setTask] = useState<MicroTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = async () => {
    const res = await fetch(`/api/microtask/proponer?id=${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = await res.json();
      setTask(data.task);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchTask();
      setLoading(false);
    })();
  }, [id]);

  const evaluar = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/microtask/evaluar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id, rating, comment: comment.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error evaluando');
        setSubmitting(false);
        return;
      }
      setTask(data.task);
      // Señal microtask_outcome — el rating definitivo del founder es el
      // outcome ground-truth más valioso del flywheel. Comparable contra
      // aiEvaluation.overallScore para calibrar el pre-eval (ver §8.6).
      const aiScore = data.task?.aiEvaluation?.overallScore;
      void emitSignal({
        kind: 'explicit',
        touchpoint: 'microtask_outcome',
        targetType: 'microtask',
        targetId: id,
        rating: rating as 1 | 2 | 3 | 4 | 5,
        text: comment.trim() || undefined,
        icsAtTime: typeof aiScore === 'number' ? aiScore : undefined,
      });
    } catch (e) {
      setError('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <LoadingSpinner variant="section" label="Cargando…" containerClassName="max-w-3xl mx-auto px-6" />
    );
  }
  if (!task) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <h2 className="text-xl font-display font-medium mb-4">Tarea no encontrada</h2>
        <Link href="/empresa/matches">
          <Button>Volver a matches</Button>
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
          {isPending && <Badge className="bg-amber-100 text-amber-800 border-transparent">Esperando entrega del joven</Badge>}
          {isDelivered && <Badge className="bg-emerald-100 text-emerald-800 border-transparent">Entregada · listo para evaluar</Badge>}
          {isEvaluated && (
            <Badge className="bg-emerald-100 text-emerald-800 border-transparent">
              <CheckCircle2 size={12} className="mr-1" />
              Evaluada
            </Badge>
          )}
          <Badge variant="outline" className="border-slate-200 text-slate-600">
            <User size={11} className="mr-1" />
            {task.profileName}
          </Badge>
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-[1.05]">
          {task.title}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <span className="flex items-center gap-1.5">
            <DollarSign size={14} className="text-emerald-600" />
            <strong>${task.amountCOP.toLocaleString('es-CO')} COP</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={14} className="text-slate-500" />
            {task.deadlineHours}h
          </span>
        </div>
      </header>

      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">Brief</div>
          <p className="text-slate-800 leading-relaxed">{task.brief}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <Target size={11} /> Entregable esperado
          </div>
          <p className="text-slate-800 leading-relaxed">{task.expectedDeliverable}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <ListChecks size={11} /> Criterios
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

      {isPending && (
        <section className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-10 text-center">
          <Clock size={24} className="text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">
            <strong>{task.profileName.split(' ')[0]}</strong> aún no entregó. Te avisaremos cuando esté listo para evaluar.
          </p>
        </section>
      )}

      {(isDelivered || isEvaluated) && (
        <>
          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-3">Entregable</div>
            <pre className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">{task.deliverable}</pre>
          </section>

          {task.aiEvaluation && (
            <section className="bg-slate-950 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl" aria-hidden />
              <div className="relative">
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
                <p className="text-slate-200 leading-relaxed mb-6 max-w-3xl">{task.aiEvaluation.overallComment}</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {task.aiEvaluation.criteriaScores.map((s, i) => (
                    <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-white">{s.name}</span>
                        <span className="font-mono tabular-nums text-emerald-400 font-bold text-sm">{s.score}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{s.comment}</p>
                    </div>
                  ))}
                </div>
                {/* Calibración de la pre-eval: ¿el founder concuerda con
                    la IA ANTES de poner su propia nota? Este es el touchpoint
                    más alto valor del flywheel — si el founder dice "no",
                    sabemos que el rating final lo va a contradecir, y eso
                    es el signal que reentrena los pesos del evaluador IA.
                    Sólo aparece en isDelivered (antes de que el founder vote)
                    o si todavía no envió el thumbs en isEvaluated. */}
                <div className="mt-6 pt-5 border-t border-slate-800">
                  <FeedbackInlinePrompt
                    question="¿Coincidís con esta pre-evaluación?"
                    hint="Tu acuerdo/desacuerdo se compara contra tu rating final para calibrar la IA."
                    variant="thumbs"
                    touchpoint="ai_preeval_agreement"
                    targetType="microtask"
                    targetId={id}
                    icsAtTime={task.aiEvaluation.overallScore}
                    dismissible
                  />
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {isDelivered && (
        <section className="bg-amber-50/60 border border-amber-200 rounded-2xl p-6 md:p-8">
          <h2 className="font-display font-bold text-xl text-slate-900 mb-1">Tu calificación final</h2>
          <p className="text-sm text-slate-600 mb-5">
            La IA hizo la pre-evaluación. Tú das el rating definitivo. Esta calificación queda pública en el perfil del joven como outcome verificado.
          </p>

          <div className="bg-white rounded-xl p-4 mb-4 border border-amber-200">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Rating</div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => {
                const n = i + 1;
                const active = n <= (hoverRating || rating);
                return (
                  <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(n)}
                    className="p-1 transition-transform hover:scale-110"
                    aria-label={`${n} estrellas`}
                  >
                    <Star
                      size={32}
                      fill={active ? '#d97706' : 'none'}
                      className="text-amber-600"
                      strokeWidth={1.5}
                    />
                  </button>
                );
              })}
              {rating > 0 && (
                <span className="ml-3 text-2xl font-display font-bold text-amber-700">{rating}/5</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Comentario para el joven <span className="text-slate-400 font-normal">(opcional pero recomendado)</span></label>
            <Textarea
              placeholder="Qué te gustó, qué le falta, si lo vas a contactar para una entrevista formal. Esto es feedback real que el joven raramente recibe."
              className="bg-white min-h-28 leading-relaxed"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button
              onClick={evaluar}
              disabled={submitting || rating === 0}
              size="lg"
              className="gap-2 bg-amber-600 hover:bg-amber-700"
            >
              {submitting ? 'Guardando…' : (
                <>
                  <CheckCircle2 size={16} /> Confirmar evaluación · publicar en perfil
                </>
              )}
            </Button>
          </div>
        </section>
      )}

      {isEvaluated && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 md:p-8">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-800 font-semibold mb-3">Tu calificación · publicada en el perfil</div>
          <div className="flex items-center gap-2 mb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={24}
                fill={i < (task.companyRating ?? 0) ? '#d97706' : 'none'}
                className="text-amber-600"
                strokeWidth={1.5}
              />
            ))}
            <span className="text-2xl font-display font-bold text-amber-700 ml-2">
              {task.companyRating}/5
            </span>
          </div>
          {task.companyComment && (
            <blockquote className="text-slate-800 italic leading-relaxed border-l-2 border-amber-300 pl-4">
              &quot;{task.companyComment}&quot;
            </blockquote>
          )}
          <div className="mt-5 pt-5 border-t border-emerald-200 flex items-center justify-between gap-3">
            <p className="text-xs text-emerald-900 leading-relaxed">
              ¿{task.profileName.split(' ')[0]} funcionó? El próximo paso natural es una conversación de contratación formal.
            </p>
            <Link
              href={
                task.needId
                  ? `/empresa/candidatos/${task.profileId}?needId=${encodeURIComponent(task.needId)}`
                  : `/empresa/candidatos/${task.profileId}`
              }
            >
              <Button variant="outline" size="sm" className="bg-white">
                Ver perfil completo
              </Button>
            </Link>
          </div>
          {/* Cierre del loop: ¿lo contrataste formalmente? Este es el dato
              propietario del flywheel (§8.6): correlaciona ICS al momento
              del match contra outcome real de contratación. Es lo que
              ningún wrapper de LinkedIn tiene. dismissible=false: queremos
              cerrar el loop aunque la respuesta sea "no". */}
          <div className="mt-5 pt-5 border-t border-emerald-200">
            <FeedbackInlinePrompt
              question="¿Lo contrataste formalmente?"
              hint={`Esto cierra el loop de validación. Si "no", contanos por qué — esa data nos hace mejores.`}
              variant="thumbs"
              touchpoint="post_hire_followup"
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
