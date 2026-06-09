'use client';

import { Badge } from '@/components/ui/badge';
import { Quote, CheckCircle2, Sparkles, MessageSquareQuote, Layers, Network } from 'lucide-react';
import CvCustomizer from '@/components/cv-customizer';
import { FeedbackThumbs } from '@/components/feedback/thumbs';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { Tooltip } from '@/components/ui/tooltip';
import { useProfile } from '../profile-context';

/**
 * Módulo "Hoja de vida": el documento profesional y la evidencia que lo
 * respalda. El dueño personaliza su CV; ambos (dueño y empresa) ven las
 * habilidades, rasgos y la evidencia citada.
 */
export default function HojaDeVidaPage() {
  const { id, perfil, viewerIsEmpresa, verifiedSkills } = useProfile();

  return (
    <>
      {/* CV — solo el dueño lo personaliza (la empresa lo descarga desde Evaluar). */}
      {!viewerIsEmpresa && (
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

      {/* Pipeline pedagógico (solo dueño): cómo la conversación se volvió señal. */}
      {!viewerIsEmpresa && (
        <section className="bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-slate-200 rounded-3xl p-8 md:p-10">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
            Tu historia → Evidencia
          </div>
          <h2 className="font-display font-semibold text-2xl md:text-3xl text-slate-900 mb-8 tracking-tight">
            Así fue cómo SaltoAI convirtió lo que contaste en señales comparables.
          </h2>
          <Stagger className="grid md:grid-cols-3 gap-4" stagger={0.08}>
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
                body: `${perfil.evidence.length} señal${perfil.evidence.length === 1 ? '' : 'es'} citada${
                  perfil.evidence.length === 1 ? '' : 's'
                } · cada habilidad anclada a una cita textual.`,
              },
              {
                icon: Network,
                step: '03',
                title: 'Te volvimos comparable',
                body: 'Tu perfil se vectorizó y entró al motor ICS. Las empresas ya pueden encontrarte.',
              },
            ].map(({ icon: Icon, step, title, body }) => (
              <StaggerItem key={step} className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
                    <Icon size={18} strokeWidth={1.75} />
                  </div>
                  <span className="text-2xl font-display font-bold text-slate-200 tabular-nums">{step}</span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1.5">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {/* Skills + Traits */}
      <section className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
                Habilidades
              </div>
              <h3 className="font-display font-semibold text-xl text-slate-900">Lo que sabes hacer</h3>
            </div>
            <span className="text-3xl font-display font-bold text-slate-200 tabular-nums">
              {perfil.skills.length}
            </span>
          </div>
          {perfil.skills.length === 0 && verifiedSkills.size === 0 ? (
            <p className="text-sm text-slate-400">Sin habilidades extraídas. Vuelve a la entrevista.</p>
          ) : (
            (() => {
              const profileKeys = new Set(perfil.skills.map((s) => s.trim().toLowerCase()));
              const docOnly = Array.from(verifiedSkills.values()).filter(
                (v) => !profileKeys.has(v.label.toLowerCase())
              );
              const hasVerified = verifiedSkills.size > 0;
              return (
                <>
                  <div className="flex flex-wrap gap-2">
                    {perfil.skills.map((skill, i) => {
                      const v = verifiedSkills.get(skill.trim().toLowerCase());
                      return v ? (
                        <Tooltip
                          key={`s-${i}`}
                          content={
                            v.evidence
                              ? `Verificada por un documento que subiste — "${v.evidence}"`
                              : 'Verificada por un documento que subiste'
                          }
                        >
                          <Badge className="bg-emerald-600 text-white border-transparent gap-1 px-3 py-1 text-sm font-medium cursor-help">
                            <CheckCircle2 size={12} /> {skill}
                          </Badge>
                        </Tooltip>
                      ) : (
                        <Badge
                          key={`s-${i}`}
                          className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 text-sm font-medium"
                        >
                          {skill}
                        </Badge>
                      );
                    })}
                    {docOnly.map((v, i) => (
                      <Tooltip
                        key={`d-${i}`}
                        content={
                          v.evidence
                            ? `Verificada por un documento que subiste — "${v.evidence}"`
                            : 'Verificada por un documento que subiste'
                        }
                      >
                        <Badge className="bg-emerald-600 text-white border-transparent gap-1 px-3 py-1 text-sm font-medium cursor-help">
                          <CheckCircle2 size={12} /> {v.label}
                        </Badge>
                      </Tooltip>
                    ))}
                  </div>
                  {hasVerified && (
                    <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      Verificada por un documento que subiste
                    </p>
                  )}
                </>
              );
            })()
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
                Rasgos
              </div>
              <h3 className="font-display font-semibold text-xl text-slate-900">Cómo trabajas</h3>
            </div>
            <span className="text-3xl font-display font-bold text-slate-200 tabular-nums">
              {perfil.traits.length}
            </span>
          </div>
          {perfil.traits.length === 0 ? (
            <p className="text-sm text-slate-400">Sin rasgos extraídos.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {perfil.traits.map((trait, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="bg-emerald-50/40 border-emerald-200 text-emerald-900 px-3 py-1 text-sm font-medium"
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
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1">
              Evidencia citada
            </div>
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
            <p className="text-sm text-slate-500">
              No se ancló evidencia. Vuelve a la entrevista y profundiza más en lo que contaste.
            </p>
          </div>
        ) : (
          <Stagger className="space-y-4" stagger={0.06}>
            {perfil.evidence.map((ev, i) => (
              <StaggerItem
                key={i}
                className="group relative bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 md:p-8 hover:border-emerald-200 transition-colors"
              >
                <div className="grid md:grid-cols-12 gap-4 sm:gap-6 items-start">
                  <div className="md:col-span-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold mb-1 sm:mb-2">
                      Habilidad #{i + 1}
                    </div>
                    <h4 className="font-display font-semibold text-base sm:text-lg text-slate-900 leading-tight">
                      {ev.skill}
                    </h4>
                  </div>
                  <div className="md:col-span-9">
                    <div className="relative pl-5 md:pl-10">
                      <Quote
                        size={22}
                        className="absolute -left-1 top-0 text-emerald-200 group-hover:text-emerald-300 transition-colors"
                        fill="currentColor"
                      />
                      <blockquote className="font-display text-lg sm:text-xl md:text-2xl text-slate-800 leading-snug italic">
                        &quot;{ev.quote}&quot;
                      </blockquote>
                    </div>
                  </div>
                </div>
                {!viewerIsEmpresa && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-slate-500">¿La cita captura bien lo que contaste?</span>
                    <FeedbackThumbs
                      label=""
                      thanksText="Gracias, lo registramos."
                      layout="inline"
                      silent
                      touchpoint="evidence_quote"
                      targetType="evidence"
                      targetId={`${id}__ev_${i}`}
                    />
                  </div>
                )}
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>
    </>
  );
}
