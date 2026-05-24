'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Quote,
  CheckCircle2,
  Sparkles,
  MessageSquareQuote,
  Layers,
  Network,
  ArrowRight,
  Building2,
} from 'lucide-react';
import type { Gender, Profile } from '@/lib/types';
import type { StorageMode } from '@/lib/db';
import CvCustomizer from '@/components/cv-customizer';
import { useAuth } from '@/lib/auth-context';

const GENDER_LABEL: Record<Gender, string> = {
  mujer: 'Mujer',
  hombre: 'Hombre',
  otro: 'Otro',
  prefiero_no_decir: '',
};

export default function PerfilPorId({ params }: { params: Promise<{ id: string }> }) {
  // NO RoleGate: este perfil es contenido público de matching. Una empresa
  // logueada como `empresa` viene desde /empresa/matches/{needId} y necesita
  // ver al candidato sin chocar contra un muro. El banner contextual abajo
  // se ocupa de la UX cuando el viewer es founder.
  const { id } = use(params);
  const { account } = useAuth();
  const viewerIsEmpresa = account?.role === 'empresa';
  const [perfil, setPerfil] = useState<Profile | null>(null);
  const [storage, setStorage] = useState<StorageMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/perfil?id=${encodeURIComponent(id)}`);
        if (!res.ok) {
          if (!cancelled) setError('Perfil no encontrado');
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setPerfil(data.profile);
          setStorage(data.storage ?? (id.startsWith('local_') ? 'memory' : 'firestore'));
          try {
            localStorage.setItem('salto_last_profile_id', id);
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        if (!cancelled) setError('Error cargando perfil');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 text-slate-500">
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="ml-2 text-sm">Cargando tu Perfil de Evidencia…</span>
        </div>
      </div>
    );
  }

  if (error || !perfil) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <h2 className="text-xl font-display font-medium mb-4">{error || 'Perfil no encontrado'}</h2>
        <Link href="/joven/chat">
          <Button>Volver a la entrevista</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10 sm:space-y-14">
      {/* Banner contextual: cuando un founder visita este perfil desde sus
          matches, le damos contexto + camino de vuelta. Sin esto, ve el
          chrome del joven ("Entrevista", "Mis tareas") sin entender por
          qué llegó acá. */}
      {viewerIsEmpresa && (
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-50/30 border border-emerald-200/60 rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-sm text-slate-700">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <Building2 size={14} />
            </div>
            <div className="leading-snug">
              <span className="font-semibold text-slate-900">Estás viendo el perfil de un candidato</span>
              <span className="text-slate-600 hidden md:inline"> · Salto te muestra evidencia citada, no un CV.</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/empresa">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowRight size={13} className="rotate-180" /> Mis matches
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* HERO — sin avatar/foto (el producto no maneja foto de perfil).
          Mantengo las clases responsive del HEAD remoto (sm:) para mobile. */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-transparent">
            <CheckCircle2 size={12} className="mr-1" />
            Perfil de Evidencia · Verificado por Salto IA
          </Badge>
          <Badge variant="outline" className="border-slate-200 text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Indexado para matching
          </Badge>
          {storage === 'firestore' ? (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50/50 text-emerald-800">
              Guardado en la nube
            </Badge>
          ) : storage === 'memory' ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50/50 text-amber-900">
              Solo en esta sesión · configura Firebase
            </Badge>
          ) : null}
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-slate-900 tracking-tight leading-[1.05]">
          {perfil.name}
        </h1>
        <p className="text-slate-600">
          {perfil.age ?? '—'} años
          {perfil.gender && perfil.gender !== 'prefiero_no_decir' && GENDER_LABEL[perfil.gender]
            ? ` · ${GENDER_LABEL[perfil.gender]}`
            : ''}
        </p>
        {perfil.summary && (
          <p className="text-base sm:text-lg md:text-xl text-slate-700 leading-relaxed max-w-3xl">
            {perfil.summary}
          </p>
        )}
      </header>

      {/* "Las empresas ya pueden verte" — antes era CTA al final de página.
          Ahora va arriba para que sea la primera cosa que ve el joven al
          terminar la entrevista: confirmación + call to action. */}
      {!viewerIsEmpresa && (
        <section className="bg-slate-950 text-white rounded-3xl p-8 md:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl" aria-hidden />
          <div className="relative max-w-3xl">
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-300 border-transparent mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
              Visible para empresas
            </Badge>
            <h2 className="font-display font-bold text-3xl md:text-4xl mb-3 tracking-tight leading-tight">
              Las empresas ya pueden verte.
            </h2>
            <p className="text-slate-300 leading-relaxed mb-6 max-w-2xl">
              Tu Perfil de Evidencia entró al motor de matching. Cuando una empresa temprana publique su necesidad, Salto calculará tu Índice de Compatibilidad (ICS) en tiempo real y, si encajas, aparecerás en su shortlist (top 10).
            </p>
            <Link href={`/joven/conectar?profileId=${encodeURIComponent(id)}`}>
              <Button className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
                <Building2 size={16} /> Conectar con empresas <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* Bloque contextual por rol del viewer:
          - Joven dueño del perfil → CvCustomizer (personaliza SU CV con SUS
            datos de contacto, idiomas, educación; persistencia localStorage
            por profileId).
          - Empresa viendo candidato → acciones de evaluación (proponer
            micro-tarea pagada, descargar CV ATS read-only sin posibilidad
            de editar contacto). Un founder no necesita personalizar el
            CV del candidato — lo evalúa dentro de Salto y propone tarea.
            Antes ambos roles veían el CvCustomizer y el founder podía
            sobrescribir los datos guardados en su browser. */}
      {viewerIsEmpresa ? (
        <section>
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
              Próximo paso
            </div>
            <h2 className="font-display font-bold text-2xl md:text-3xl text-slate-900 tracking-tight leading-tight">
              ¿Cómo quieres evaluar a {perfil.name.split(' ')[0]}?
            </h2>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-wrap gap-3 items-start">
            <Link href={`/empresa/probar/${id}`}>
              <Button className="gap-2">
                <Sparkles size={14} /> Proponer micro-tarea pagada
              </Button>
            </Link>
            <a
              href={`/api/cv?profileId=${encodeURIComponent(id)}&style=minimalist&autoprint=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="gap-2">
                Descargar CV ATS
              </Button>
            </a>
            <p className="w-full text-xs text-slate-500 mt-2 leading-relaxed">
              <strong className="text-slate-700">Recomendación:</strong> en lugar de mandar el
              CV a tu mail, proponé una micro-tarea pagada acotada. Te llega evidencia REAL de
              cómo trabaja antes de comprometerte con un contrato.
            </p>
          </div>
        </section>
      ) : (
        <section>
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
              Tu CV listo para postular
            </div>
            <h2 className="font-display font-bold text-2xl md:text-3xl text-slate-900 tracking-tight leading-tight">
              Elige plantilla y completa tu contacto.
            </h2>
          </div>
          <CvCustomizer profileId={id} />
        </section>
      )}

      {/* Tu historia → Evidencia (pipeline pedagógico) */}
      <section className="bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-slate-200 rounded-3xl p-8 md:p-10">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">Tu historia → Evidencia</div>
        <h2 className="font-display font-semibold text-2xl md:text-3xl text-slate-900 mb-8 tracking-tight">
          Así fue cómo Salto convirtió lo que contaste en señales comparables.
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              icon: MessageSquareQuote,
              step: '01',
              title: 'Conversaste',
              body: 'Contaste desafíos reales que viviste, sin formularios ni preguntas genéricas.',
            },
            {
              icon: Layers,
              step: '02',
              title: 'Extrajimos evidencia',
              body: `${perfil.evidence.length} señal${perfil.evidence.length === 1 ? '' : 'es'} citada${perfil.evidence.length === 1 ? '' : 's'} · cada habilidad anclada a una cita textual.`,
            },
            {
              icon: Network,
              step: '03',
              title: 'Te volvimos comparable',
              body: 'Tu perfil se vectorizó y entró al motor ICS. Las empresas ya pueden encontrarte.',
            },
          ].map(({ icon: Icon, step, title, body }) => (
            <div key={step} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
                  <Icon size={18} strokeWidth={1.75} />
                </div>
                <span className="text-2xl font-display font-bold text-slate-200 tabular-nums">{step}</span>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Skills + Traits */}
      <section className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">Habilidades</div>
              <h3 className="font-display font-semibold text-xl text-slate-900">Lo que sabes hacer</h3>
            </div>
            <span className="text-3xl font-display font-bold text-slate-200 tabular-nums">{perfil.skills.length}</span>
          </div>
          {perfil.skills.length === 0 ? (
            <p className="text-sm text-slate-400">Sin habilidades extraídas. Vuelve a la entrevista.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {perfil.skills.map((skill, i) => (
                <Badge
                  key={i}
                  className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 text-sm font-medium"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700 font-semibold mb-1">Rasgos</div>
              <h3 className="font-display font-semibold text-xl text-slate-900">Cómo trabajas</h3>
            </div>
            <span className="text-3xl font-display font-bold text-slate-200 tabular-nums">{perfil.traits.length}</span>
          </div>
          {perfil.traits.length === 0 ? (
            <p className="text-sm text-slate-400">Sin rasgos extraídos.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {perfil.traits.map((trait, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="bg-amber-50/40 border-amber-200 text-amber-900 px-3 py-1 text-sm font-medium"
                >
                  {trait}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Evidencia citada */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1">Evidencia citada</div>
            <h2 className="font-display font-bold text-3xl text-slate-900 tracking-tight">
              Cada habilidad, anclada a tu voz.
            </h2>
          </div>
          <Badge variant="outline" className="border-slate-200 text-slate-600 hidden md:inline-flex">
            <Sparkles size={12} className="mr-1.5 text-emerald-500" />
            Anti-alucinación: sin cita, no entra
          </Badge>
        </div>

        {perfil.evidence.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-12 text-center">
            <p className="text-sm text-slate-500">No se ancló evidencia. Vuelve a la entrevista y profundiza más en lo que contaste.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {perfil.evidence.map((ev, i) => (
              <article
                key={i}
                className="group relative bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 md:p-8 hover:border-emerald-200 transition-colors"
              >
                <div className="grid md:grid-cols-12 gap-4 sm:gap-6 items-start">
                  <div className="md:col-span-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold mb-1 sm:mb-2">Habilidad #{i + 1}</div>
                    <h4 className="font-display font-semibold text-base sm:text-lg text-slate-900 leading-tight">{ev.skill}</h4>
                  </div>
                  <div className="md:col-span-9">
                    <div className="relative pl-5 md:pl-10">
                      <Quote
                        size={22}
                        className="absolute -left-1 top-0 text-emerald-200 group-hover:text-emerald-300 transition-colors"
                        fill="currentColor"
                      />
                      <blockquote className="font-display text-lg sm:text-xl md:text-2xl text-slate-800 leading-snug italic">
                        "{ev.quote}"
                      </blockquote>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
