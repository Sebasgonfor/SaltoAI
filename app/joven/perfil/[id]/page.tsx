'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Quote,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowRight,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { FeedbackInlinePrompt } from '@/components/feedback/inline-prompt';
import { CompanyFeedbackToYouth, PassReasonButton } from '@/components/feedback/company-to-youth';
import { CountUp, Stagger, StaggerItem } from '@/components/ui/motion';
import { Tooltip } from '@/components/ui/tooltip';
import { useEmitSignal } from '@/hooks/use-emit-signal';
import { useProfile } from './profile-context';

/**
 * Módulo "Resumen" (página principal de Mi Perfil).
 *  - Dueño: vistazo de cifras clave + habilidades destacadas + CTA de matching
 *    + prompts de feedback.
 *  - Empresa: panel de evaluación del candidato (proponer tarea, CV, descarte).
 */
export default function ResumenPage() {
  const { id, perfil, viewerIsEmpresa, isDemo, verifiedSkills } = useProfile();
  const emit = useEmitSignal();
  const base = `/joven/perfil/${id}`;

  if (viewerIsEmpresa) {
    return (
      <section className="space-y-5">
        <div className="mb-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
            Próximo paso
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-slate-900 tracking-tight leading-tight">
            ¿Cómo quieres evaluar a {perfil.name.split(' ')[0]}?
          </h2>
        </div>

        {isDemo && (
          <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm leading-relaxed">
              <div className="font-semibold text-emerald-900 mb-0.5">Este perfil es de demostración</div>
              <p className="text-emerald-800 text-xs">
                No corresponde a un usuario real autenticado, así que no recibirá tu feedback ni
                microtasks. Sirve para que veas cómo se ve un Perfil de Evidencia completo. Para
                acciones reales, buscá candidatos desde tus matches con jóvenes registrados.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-wrap gap-3 items-start">
          {!isDemo && (
            <Link href={`/empresa/probar/${id}`}>
              <Button className="gap-2">
                <Sparkles size={14} /> Proponer micro-tarea pagada
              </Button>
            </Link>
          )}
          <a
            href={`/api/cv?profileId=${encodeURIComponent(id)}&style=minimalist&autoprint=1`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              emit({ touchpoint: 'cv_generated', targetType: 'profile', targetId: id });
            }}
          >
            <Button variant="outline" className="gap-2">
              Descargar CV ATS
            </Button>
          </a>
          {!isDemo && <PassReasonButton profileId={id} profileName={perfil.name} />}
          <p className="w-full text-xs text-slate-500 mt-2 leading-relaxed">
            <strong className="text-slate-700">Recomendación:</strong> en lugar de mandar el CV a tu
            mail, propón una micro-tarea pagada acotada. Te llega evidencia REAL de cómo trabaja
            antes de comprometerte con un contrato.
          </p>
        </div>
        {!isDemo && <CompanyFeedbackToYouth profileId={id} profileName={perfil.name} />}
      </section>
    );
  }

  return (
    <>
      {/* Un vistazo: cifras clave con separadores hairline (técnica gap-px, a
          prueba de wrap en móvil). Cada cifra entra a su módulo. */}
      <div className="space-y-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
          {[
            { n: perfil.skills.length, label: 'Habilidades', href: `${base}/hoja-de-vida`, icon: Layers },
            { n: perfil.evidence.length, label: 'Evidencias citadas', href: `${base}/hoja-de-vida`, icon: Quote },
            { n: perfil.traits.length, label: 'Rasgos', href: `${base}/hoja-de-vida`, icon: Sparkles },
            {
              n: verifiedSkills.size,
              label: 'Verificadas por documento',
              href: `${base}/documentos`,
              icon: CheckCircle2,
            },
          ].map((s) => {
            const SIcon = s.icon;
            return (
              <Link
                key={s.label}
                href={s.href}
                className="group bg-white p-5 sm:p-6 text-left transition-colors hover:bg-emerald-50/40"
              >
                <SIcon
                  size={16}
                  strokeWidth={1.9}
                  className="text-slate-300 group-hover:text-emerald-500 transition-colors mb-3"
                />
                <CountUp
                  value={s.n}
                  className="block text-3xl md:text-4xl font-display font-bold text-slate-900 tabular-nums leading-none"
                />
                <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold leading-tight">
                  {s.label}
                </div>
              </Link>
            );
          })}
        </div>

        {perfil.skills.length > 0 && (
          <section>
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
                  Habilidades destacadas
                </div>
                <h2 className="font-display font-bold text-2xl text-slate-900 tracking-tight leading-tight">
                  Lo que sabes hacer
                </h2>
              </div>
              <Link
                href={`${base}/hoja-de-vida`}
                className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
              >
                Ver evidencia <ArrowRight size={14} />
              </Link>
            </div>
            <Stagger className="flex flex-wrap gap-2" stagger={0.04}>
              {perfil.skills.slice(0, 12).map((skill, i) => {
                const v = verifiedSkills.get(skill.trim().toLowerCase());
                return v ? (
                  <StaggerItem key={`rs-${i}`}>
                    <Tooltip
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
                  </StaggerItem>
                ) : (
                  <StaggerItem key={`rs-${i}`}>
                    <Badge className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 text-sm font-medium">
                      {skill}
                    </Badge>
                  </StaggerItem>
                );
              })}
              {perfil.skills.length > 12 && (
                <Link
                  href={`${base}/hoja-de-vida`}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
                >
                  +{perfil.skills.length - 12} más
                </Link>
              )}
            </Stagger>
          </section>
        )}
      </div>

      {/* "Las empresas ya pueden verte" — confirmación + CTA al matching. */}
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
            Tu Perfil de Evidencia entró al motor de matching. Cuando una empresa temprana publique su
            necesidad, SaltoAI calculará tu Índice de Compatibilidad (ICS) en tiempo real y, si
            encajas, aparecerás en su shortlist (top 10).
          </p>
          <Link href={`/joven/conectar?profileId=${encodeURIComponent(id)}`}>
            <Button className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
              <Building2 size={16} /> Conectar con empresas <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </section>

      {/* Feedback del joven sobre la entrevista y la precisión del perfil. */}
      <div className="grid sm:grid-cols-2 gap-3">
        <FeedbackInlinePrompt
          question="¿La entrevista entendió tu potencial?"
          hint="Tu calificación entrena el motor que extrae evidencia."
          variant="rating"
          touchpoint="interview_quality"
          targetType="profile"
          targetId={id}
        />
        <FeedbackInlinePrompt
          question="¿Este perfil te representa?"
          hint="Si algo falta o sobra, marcalo — lo usamos para afinar."
          variant="thumbs"
          touchpoint="profile_accuracy"
          targetType="profile"
          targetId={id}
        />
      </div>
    </>
  );
}
