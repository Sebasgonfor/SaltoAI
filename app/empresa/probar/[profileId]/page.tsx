'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Wand2,
  AlertTriangle,
  ArrowRight,
  Lightbulb,
  Sparkles,
  DollarSign,
  Clock,
  Target,
  ListChecks,
} from 'lucide-react';
import type { CompanyNeed, MicroTask, Profile } from '@/lib/types';

const COMPANY_ID_KEY = 'salto_company_id';

function getOrCreateCompanyId(): string {
  if (typeof window === 'undefined') return 'anon';
  let id = localStorage.getItem(COMPANY_ID_KEY);
  if (!id) {
    id = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(COMPANY_ID_KEY, id);
  }
  return id;
}

export default function ProbarCandidato({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const router = useRouter();
  const sp = useSearchParams();
  const needId = sp.get('needId') || undefined;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [need, setNeed] = useState<CompanyNeed | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [rawRequest, setRawRequest] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MicroTask | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const reqs: Promise<Response>[] = [fetch(`/api/perfil?id=${profileId}`)];
        if (needId) reqs.push(fetch(`/api/necesidad?id=${needId}`));
        const [pRes, nRes] = await Promise.all(reqs);
        if (pRes.ok) {
          const data = await pRes.json();
          setProfile(data.profile);
        }
        if (nRes && nRes.ok) {
          const data = await nRes.json();
          setNeed(data.need);
          if (data.need?.companyName) setCompanyName(data.need.companyName);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId, needId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !rawRequest.trim()) return;
    setSubmitting(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch('/api/microtask/proponer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: getOrCreateCompanyId(),
          companyName: companyName.trim(),
          profileId,
          rawRequest: rawRequest.trim(),
          amountCOP: typeof amount === 'number' ? amount : undefined,
          needId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error proponiendo la tarea');
        setSubmitting(false);
        return;
      }
      setCreated(data.task);
      if (data.exploitationWarning) setWarning(data.exploitationWarning);
    } catch (e) {
      setError('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center text-slate-500">
        Cargando candidato…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <h2 className="text-xl font-display font-medium mb-4">Candidato no encontrado</h2>
        <Link href="/empresa/chat">
          <Button>Publicar necesidad</Button>
        </Link>
      </div>
    );
  }

  // Vista de confirmación post-creación
  if (created) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <Badge className="bg-emerald-100 text-emerald-800 border-transparent">
          <Sparkles size={12} className="mr-1.5" />
          Tarea propuesta · estructurada por IA
        </Badge>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
          Listo. {profile.name.split(' ')[0]} ya puede empezar.
        </h1>
        <p className="text-slate-600 leading-relaxed">
          La micro-tarea está activa. Cuando entregue, vas a recibir una pre-evaluación de Salto IA contra los criterios estructurados, y tú das la calificación final.
        </p>

        {warning && (
          <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 leading-relaxed">{warning}</p>
          </div>
        )}

        <TaskPreview task={created} />

        <div className="flex gap-3 pt-4">
          <Link href="/empresa/matches" className="flex-1">
            <Button variant="outline" className="w-full">Volver a mis matches</Button>
          </Link>
          <Link href={`/empresa/tareas/${created.id}`} className="flex-1">
            <Button className="w-full gap-2">
              Ver detalle de la tarea <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 lg:py-14 w-full">
      <header className="mb-10 max-w-3xl">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-600 font-semibold mb-3">Probar antes de contratar</div>
        <h1 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-[1.05] mb-4">
          Pagale una tarea real a {profile.name.split(' ')[0]} antes de comprometerte.
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed">
          Salto IA estructura tu intención libre en una micro-tarea concreta con criterios de evaluación claros, monto justo y deadline razonable. Si funciona, pasas a contratación formal con evidencia real, no un CV.
        </p>
      </header>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* FORM */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Nombre de tu empresa</label>
              <Input
                placeholder="Ej. Arepas El Primo"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={submitting}
                className="text-base h-12 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                ¿Qué quieres que haga? <span className="text-slate-400 font-normal">(con tus palabras)</span>
              </label>
              <Textarea
                placeholder="Ej. Que escriba 3 captions para mi Instagram de panadería, mostrando los pandebonos del día. Tono cercano, pueblerino, no corporativo. Que muestre iniciativa: si quiere proponer un hashtag o un ángulo distinto, bienvenido."
                className="min-h-40 p-4 text-[15px] leading-relaxed bg-white"
                required
                value={rawRequest}
                onChange={(e) => setRawRequest(e.target.value)}
                disabled={submitting}
              />
              <p className="text-[11px] text-slate-500 mt-2">
                <Sparkles size={11} className="inline mr-1 text-emerald-500" />
                La IA convertirá esto en un brief claro con entregable + 3 criterios de evaluación.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Monto en COP <span className="text-slate-400 font-normal">(opcional · si no lo pones, la IA sugiere uno)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">$</span>
                <Input
                  type="number"
                  placeholder="80000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  disabled={submitting}
                  className="text-base h-12 bg-white pl-7"
                  min="0"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Rango sugerido LATAM para tareas de 1-4h: $30.000 — $200.000 COP.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3.5 rounded-lg">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <Button variant="ghost" type="button" onClick={() => router.back()} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting || !companyName.trim() || !rawRequest.trim()}
                size="lg"
                className="gap-2 min-w-[220px]"
              >
                {submitting ? 'Estructurando con IA…' : (
                  <>
                    <Wand2 size={16} /> Proponer micro-tarea
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* SIDE — candidato + qué pasa después */}
        <aside className="lg:col-span-5 space-y-4">
          <div className="bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-slate-200 rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
              Probando a
            </div>
            <h3 className="font-display font-bold text-2xl text-slate-900 mb-2">{profile.name}</h3>
            <p className="text-sm text-slate-700 leading-relaxed mb-4">{profile.summary}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {profile.skills.slice(0, 4).map((s) => (
                <Badge key={s} variant="secondary" className="bg-white text-slate-700 border border-slate-200 text-xs">{s}</Badge>
              ))}
            </div>
            {profile.taskStats && profile.taskStats.totalCompleted > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                <strong>Track record:</strong> {profile.taskStats.totalCompleted} micro-tarea{profile.taskStats.totalCompleted === 1 ? '' : 's'} previa{profile.taskStats.totalCompleted === 1 ? '' : 's'} · rating promedio {profile.taskStats.averageRating.toFixed(1)}/5
              </div>
            )}
          </div>

          {need && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">
                Necesidad publicada
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{need.role}</p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">{need.context}</p>
            </div>
          )}

          <div className="bg-slate-950 text-white rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold mb-3">
              Qué pasa cuando envías
            </div>
            <ol className="space-y-3 text-sm">
              {[
                'Gemini estructura tu intención en brief + criterios + deadline + monto.',
                `${profile.name.split(' ')[0]} recibe la tarea y entrega.`,
                'Salto IA hace pre-evaluación contra los criterios.',
                'Tú das la calificación final. Outcome queda en su perfil.',
              ].map((step, i) => (
                <li key={i} className="flex gap-3 leading-relaxed">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-mono font-semibold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-slate-300">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-4 flex gap-3">
            <Lightbulb size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-semibold">Compromiso ético:</strong> Salto monitorea uso recurrente sin oferta formal. Las micro-tareas son para probar, no para reemplazar empleo.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TaskPreview({ task }: { task: MicroTask }) {
  return (
    <div className="bg-white border-2 border-emerald-200 rounded-3xl p-6 md:p-8 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display font-bold text-2xl text-slate-900 leading-tight">{task.title}</h2>
        <div className="text-right flex-shrink-0">
          <div className="font-display font-bold text-2xl text-emerald-600 tabular-nums">
            ${task.amountCOP.toLocaleString('es-CO')}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">COP</div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
          <Clock size={14} className="text-slate-500" />
          <span><strong>{task.deadlineHours}h</strong> de deadline</span>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
          <DollarSign size={14} className="text-slate-500" />
          <span>Pago al evaluar</span>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">Brief</div>
        <p className="text-slate-700 leading-relaxed">{task.brief}</p>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
          <Target size={11} /> Entregable esperado
        </div>
        <p className="text-slate-700 leading-relaxed">{task.expectedDeliverable}</p>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
          <ListChecks size={11} /> Criterios de evaluación
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
    </div>
  );
}
