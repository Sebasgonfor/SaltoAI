'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Briefcase, Clock, DollarSign, ArrowRight, Star, Trophy, Search } from 'lucide-react';
import type { MicroTask } from '@/lib/types';

export default function TareasJoven() {
  const [profileId, setProfileId] = useState<string>('');
  const [tasks, setTasks] = useState<MicroTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const buscar = async () => {
    if (!profileId.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/microtask/list?profileId=${encodeURIComponent(profileId.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      } else {
        setTasks([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const last = typeof window !== 'undefined' ? localStorage.getItem('salto_last_profile_id') : null;
    if (last) {
      setProfileId(last);
      (async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/microtask/list?profileId=${encodeURIComponent(last)}`);
          if (res.ok) {
            const data = await res.json();
            setTasks(data.tasks || []);
          }
        } finally {
          setLoading(false);
          setSearched(true);
        }
      })();
    }
  }, []);

  const active = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  const delivered = tasks.filter((t) => t.status === 'delivered');
  const completed = tasks.filter((t) => t.status === 'evaluated' || t.status === 'paid');

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
      <header>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">Mis micro-tareas</div>
        <h1 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-[1.05] mb-3">
          Trabajos reales, pagados, antes del primer contrato.
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
          Cada micro-tarea es ingresos reales para vos y evidencia verificada para tu perfil. Mejor que un CV.
        </p>
      </header>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-2 items-center">
        <input
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          placeholder="Pega tu profileId (lo encontrás en la URL de tu perfil)"
          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 h-10 text-sm"
        />
        <Button onClick={buscar} disabled={!profileId.trim() || loading} className="gap-2">
          <Search size={14} /> {loading ? 'Buscando…' : 'Ver mis tareas'}
        </Button>
      </div>

      {!searched && (
        <div className="text-center text-slate-500 text-sm py-12">
          Buscá tus tareas con tu profileId. (En producción, esto sería automático con login).
        </div>
      )}

      {searched && tasks.length === 0 && !loading && (
        <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-12 text-center">
          <Briefcase size={32} className="text-slate-400 mx-auto mb-4" />
          <h2 className="font-display font-semibold text-xl text-slate-900 mb-2">Sin micro-tareas todavía</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Cuando una empresa te proponga una tarea, te aparecerá aquí. Mientras tanto, asegurate de que tu Perfil de Evidencia esté completo.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display font-bold text-2xl text-slate-900">Activas</h2>
            <Badge className="bg-amber-100 text-amber-900 border-transparent">{active.length}</Badge>
          </div>
          <div className="space-y-3">
            {active.map((t) => (
              <TaskRow key={t.id} task={t} action="entregar" />
            ))}
          </div>
        </section>
      )}

      {delivered.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display font-bold text-2xl text-slate-900">Esperando evaluación</h2>
            <Badge className="bg-slate-200 text-slate-700 border-transparent">{delivered.length}</Badge>
          </div>
          <div className="space-y-3">
            {delivered.map((t) => (
              <TaskRow key={t.id} task={t} action="ver" />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-amber-600" />
            <h2 className="font-display font-bold text-2xl text-slate-900">Completadas</h2>
            <Badge className="bg-amber-100 text-amber-900 border-transparent">{completed.length}</Badge>
          </div>
          <div className="space-y-3">
            {completed.map((t) => (
              <TaskRow key={t.id} task={t} action="ver" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TaskRow({ task, action }: { task: MicroTask; action: 'entregar' | 'ver' }) {
  const statusStyle =
    task.status === 'pending' || task.status === 'in_progress'
      ? 'bg-amber-100 text-amber-800'
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
    <Link href={`/joven/tareas/${task.id}`}>
      <article className="bg-white border border-slate-200 hover:border-emerald-200 hover:shadow-sm rounded-2xl p-5 transition-all flex items-start gap-4 cursor-pointer">
        <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <Briefcase size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-slate-900">{task.title}</h3>
            <Badge className={`${statusStyle} border-transparent text-xs`}>{statusLabel}</Badge>
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
              <span className="flex items-center gap-1 text-amber-600">
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
