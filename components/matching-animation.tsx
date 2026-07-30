'use client';

/**
 * Animación de carga del motor de matching.
 *
 * Usada en:
 *   - /joven/conectar — buscando oportunidades del joven ("opportunities")
 *   - /empresa/matches/[needId] y /empresa/chat — calculando ICS ("candidates")
 *
 * Diseño:
 *   - Emblema central contenido (anillos + dot "scanner" + núcleo emerald).
 *     Todo vive DENTRO de su caja — nada se sale del layout.
 *   - Stepper de 5 etapas alineadas con lo que pasa server-side; la etapa
 *     activa se ilumina con un highlight que se DESLIZA (Framer layoutId).
 *   - Honesto: no fakea progreso a 100%; cicla mientras trabaja y para al
 *     desmontarse (cuando llega el resultado).
 *   - Reduced-motion safe: el guard global de globals.css neutraliza todo.
 */

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Network,
  Sparkles,
  ShieldCheck,
  Brain,
  CheckCircle2,
  Target,
  Briefcase,
  GraduationCap,
} from 'lucide-react';

interface Stage {
  icon: React.ElementType;
  label: string;
  detail: string;
}

const STAGES_CANDIDATES: Stage[] = [
  {
    icon: Network,
    label: 'Vectorizando tu necesidad',
    detail: 'Convertimos el rol en señales semánticas comparables.',
  },
  {
    icon: Target,
    label: 'Buscando perfiles compatibles',
    detail: 'Similitud semántica contra los candidatos indexados.',
  },
  {
    icon: ShieldCheck,
    label: 'Filtrando restricciones duras',
    detail: 'Ubicación, idioma, disponibilidad.',
  },
  {
    icon: Brain,
    label: 'IA rankeando el shortlist',
    detail: 'Compara los más cercanos y devuelve el top con desglose.',
  },
  {
    icon: Sparkles,
    label: 'Aplicando feedback acumulado',
    detail: 'Ajustes finos por señales históricas.',
  },
];

const STAGES_OPPORTUNITIES: Stage[] = [
  {
    icon: GraduationCap,
    label: 'Leyendo tu Perfil de Evidencia',
    detail: 'Cada skill, cada cita textual, cada documento verificado.',
  },
  {
    icon: Briefcase,
    label: 'Buscando necesidades que encajan',
    detail: 'Recorremos las publicaciones activas por similitud semántica.',
  },
  {
    icon: ShieldCheck,
    label: 'Filtrando restricciones',
    detail: 'Roles donde tu ubicación y disponibilidad encajan.',
  },
  {
    icon: Brain,
    label: 'IA calculando tu ICS',
    detail: 'Tu encaje real con cada empresa, con desglose explicable.',
  },
  {
    icon: Sparkles,
    label: 'Priorizando oportunidades',
    detail: 'Las que más te convienen, primero.',
  },
];

export interface MatchingAnimationProps {
  variant?: 'candidates' | 'opportunities';
  /** Texto inferior — default acorde a variant. */
  helperText?: string;
}

export function MatchingAnimation({
  variant = 'candidates',
  helperText,
}: MatchingAnimationProps) {
  const stages = variant === 'opportunities' ? STAGES_OPPORTUNITIES : STAGES_CANDIDATES;
  const [activeStage, setActiveStage] = useState(0);
  const reduce = useReducedMotion();

  // Cicla las etapas cada 1.8s hasta que el componente se desmonta.
  useEffect(() => {
    const id = setInterval(() => {
      setActiveStage((s) => (s + 1) % stages.length);
    }, 1800);
    return () => clearInterval(id);
  }, [stages.length]);

  const title =
    variant === 'opportunities'
      ? 'Buscando empresas para ti'
      : 'Calculando tu Índice de Compatibilidad';
  const subtitle =
    helperText ??
    (variant === 'opportunities'
      ? 'Leemos tu perfil y medimos qué tan bien encajas en cada necesidad publicada.'
      : 'Comparamos tu necesidad contra los perfiles y rankeamos el shortlist con IA.');

  return (
    <div className="flex min-h-[66vh] w-full flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        {/* Emblema central — todo contenido dentro de la caja */}
        <div className="relative mx-auto mb-7 flex h-28 w-28 items-center justify-center">
          {/* Halo difuso que late */}
          <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-2xl animate-pulse" />
          {/* Anillos concéntricos */}
          <div className="absolute inset-1 rounded-full border border-emerald-200/80" />
          <div
            className="absolute inset-[10px] rounded-full border border-dashed border-emerald-300/70"
            style={{ animation: 'matching-spin 16s linear infinite' }}
          />
          {/* Dot "scanner" recorriendo el anillo (contenido, sin texto) */}
          <div
            className="absolute inset-2"
            style={{ animation: 'matching-spin 3.4s linear infinite' }}
          >
            <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
          </div>
          {/* Núcleo */}
          <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
            <div className="absolute inset-0 rounded-[1.25rem] bg-white/10" />
            <Sparkles size={26} strokeWidth={1.75} className="relative animate-pulse" />
          </div>
        </div>

        {/* Encabezado */}
        <div className="mb-6 text-center">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Motor de matching ICS
          </div>
          <h2 className="font-display text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            {title}
            <span className="matching-dots" aria-hidden />
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            {subtitle}
          </p>
        </div>

        {/* Stepper */}
        <div className="overflow-hidden rounded-2xl bg-slate-900 p-2 shadow-xl shadow-slate-900/10 ring-1 ring-white/5">
          {/* Barra indeterminada superior */}
          <div className="mx-2 mt-1 mb-1.5 h-0.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
              style={{ animation: 'matching-progress 1.8s ease-in-out infinite' }}
            />
          </div>

          {stages.map((stage, i) => {
            const isActive = i === activeStage;
            const isDone = i < activeStage;
            const Icon = isDone ? CheckCircle2 : stage.icon;
            return (
              <div
                key={stage.label}
                className="relative flex items-center gap-3 rounded-xl px-2.5 py-2.5"
              >
                {isActive && (
                  <motion.div
                    layoutId="matching-active-step"
                    className="absolute inset-0 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30"
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 34 }
                    }
                  />
                )}
                <div
                  className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors duration-500 ${
                    isActive
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/40'
                      : isDone
                        ? 'bg-emerald-950/60 text-emerald-400'
                        : 'bg-white/5 text-slate-500'
                  }`}
                >
                  <Icon size={15} strokeWidth={2} />
                </div>
                <div className="relative min-w-0 flex-1">
                  <h3
                    className={`truncate font-display text-sm font-semibold transition-colors duration-500 ${
                      isActive ? 'text-white' : isDone ? 'text-emerald-200/80' : 'text-slate-500'
                    }`}
                  >
                    {stage.label}
                  </h3>
                  <p
                    className={`truncate text-xs leading-relaxed transition-colors duration-500 ${
                      isActive ? 'text-emerald-100/90' : 'text-slate-600'
                    }`}
                  >
                    {stage.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Embeddings · LLM · heurística — esto toma unos segundos.
        </p>
      </div>

      <style jsx>{`
        @keyframes matching-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes matching-progress {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(420%);
          }
        }
        /* Puntos suspensivos animados después del título. */
        .matching-dots::after {
          content: '…';
          display: inline-block;
          width: 1ch;
          margin-left: 1px;
          animation: matching-ellipsis 1.4s steps(4, end) infinite;
          clip-path: inset(0 100% 0 0);
        }
        @keyframes matching-ellipsis {
          to {
            clip-path: inset(0 0 0 0);
          }
        }
      `}</style>
    </div>
  );
}

export default MatchingAnimation;
