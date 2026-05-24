'use client';

/**
 * Animación visual para los estados de carga del motor de matching.
 *
 * Reemplaza los spinners genéricos de:
 *   - /empresa/matches/[needId] — calculando ICS para candidatos
 *   - /joven/conectar — buscando oportunidades del joven
 *
 * Diseño:
 *   - 4 etapas que cyclan automáticamente, alineadas con lo que pasa
 *     server-side (vectorización → shortlist → filtro → ranking → feedback)
 *   - Cada etapa tiene un icono y un mini-paso visible
 *   - Anillo orbital animado central (núcleo de IA "pensando")
 *   - Pulsos de skills/candidatos flotantes que aparecen y desaparecen
 *   - Honesto: no fakea progreso a 100%; muestra que está trabajando
 *
 * Variantes:
 *   - "candidates": para empresa (buscando candidatos para una necesidad)
 *   - "opportunities": para joven (buscando empresas para tu perfil)
 */

import { useEffect, useState } from 'react';
import {
  Network,
  Sparkles,
  Layers,
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
    detail: 'Cosine similarity contra todos los candidatos indexados.',
  },
  {
    icon: ShieldCheck,
    label: 'Filtrando restricciones duras',
    detail: 'Ubicación, idioma, disponibilidad — sin candidatos descartables.',
  },
  {
    icon: Brain,
    label: 'IA rankeando shortlist',
    detail: 'Gemini compara los 15 más cercanos y devuelve el top con desglose.',
  },
  {
    icon: Sparkles,
    label: 'Aplicando feedback acumulado',
    detail: 'Ajustes finos por señales históricas (👍 / 👎 / microtasks).',
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
    detail: 'Roles donde tu ubicación / disponibilidad encaja.',
  },
  {
    icon: Brain,
    label: 'IA calculando tu ICS',
    detail: 'Tu encaje real con cada empresa, con desglose explicable.',
  },
  {
    icon: Sparkles,
    label: 'Priorizando oportunidades',
    detail: 'Las que más te convienen primero.',
  },
];

const ORBITING_TAGS_CANDIDATES = [
  'Atención al cliente',
  'Tolerancia al caos',
  'Resolución de problemas',
  'Excel intermedio',
  'Iniciativa',
  'WhatsApp Business',
];
const ORBITING_TAGS_OPPORTUNITIES = [
  'Tienda de barrio',
  'Marketing digital',
  'Local de comida',
  'MIPYME contable',
  'E-commerce',
  'Atención presencial',
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
  const orbitingTags =
    variant === 'opportunities' ? ORBITING_TAGS_OPPORTUNITIES : ORBITING_TAGS_CANDIDATES;
  const [activeStage, setActiveStage] = useState(0);

  // Cycle de stages cada 1.6s. Loopea hasta que el componente se desmonte
  // (cuando el resultado llega). Si la operación es más rápida que un ciclo,
  // se ve solo el primer stage — está bien, no es teatro fingiendo etapas
  // que no ocurrieron.
  useEffect(() => {
    const id = setInterval(() => {
      setActiveStage((s) => (s + 1) % stages.length);
    }, 1600);
    return () => clearInterval(id);
  }, [stages.length]);

  const title =
    variant === 'opportunities'
      ? 'Buscando empresas para ti'
      : 'Calculando Índice de Compatibilidad';
  const subtitle =
    helperText ??
    (variant === 'opportunities'
      ? 'La IA está leyendo todas las necesidades publicadas y midiendo qué tan bien encajas en cada una.'
      : 'La IA está vectorizando tu necesidad, comparando contra perfiles por similitud semántica, y rankeando el shortlist con LLM.');

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
      {/* Núcleo: orbital animation */}
      <div className="relative mx-auto mb-12 h-48 w-48">
        {/* Anillos concéntricos pulsantes */}
        <div className="absolute inset-0 rounded-full border-2 border-emerald-200/50 animate-ping" style={{ animationDuration: '2s' }} />
        <div
          className="absolute inset-3 rounded-full border-2 border-emerald-300/60"
          style={{ animation: 'matching-spin-slow 8s linear infinite' }}
        />
        <div
          className="absolute inset-6 rounded-full border-2 border-emerald-400/80 border-dashed"
          style={{ animation: 'matching-spin-reverse 6s linear infinite' }}
        />

        {/* Tags orbitando — píldoras con skills/empresas reales del dominio */}
        {orbitingTags.map((tag, i) => {
          const angle = (i / orbitingTags.length) * 2 * Math.PI;
          const radius = 110; // px
          // Cada tag se posiciona en su ángulo y orbita en grupo.
          return (
            <div
              key={tag}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                animation: 'matching-orbit 14s linear infinite',
                animationDelay: `${(i / orbitingTags.length) * -14}s`,
              }}
            >
              <div
                style={{
                  transform: `rotate(${angle}rad) translateX(${radius}px) rotate(${-angle}rad)`,
                }}
              >
                <span className="inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-medium bg-white/90 backdrop-blur border border-emerald-200 text-emerald-800 shadow-sm">
                  {tag}
                </span>
              </div>
            </div>
          );
        })}

        {/* Centro: cerebro/sparkles que late */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-pulse">
            <Sparkles size={32} strokeWidth={1.5} className="drop-shadow" />
          </div>
        </div>
      </div>

      {/* Título + subtítulo */}
      <div className="text-center mb-10">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Motor de matching ICS
        </div>
        <h2 className="text-2xl md:text-3xl font-display font-bold text-slate-900 tracking-tight leading-tight mb-3">
          {title}…
        </h2>
        <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">{subtitle}</p>
      </div>

      {/* Stepper visual: 5 etapas, la activa pulsa + se ilumina */}
      <div className="bg-slate-950 text-white rounded-3xl p-6 md:p-8 space-y-3 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {stages.map((stage, i) => {
          const isActive = i === activeStage;
          const isDone = i < activeStage;
          const Icon = isDone ? CheckCircle2 : stage.icon;
          return (
            <div
              key={stage.label}
              className={`relative flex items-start gap-4 p-3 rounded-xl transition-all duration-500 ${
                isActive
                  ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40 scale-[1.01]'
                  : isDone
                    ? 'opacity-50'
                    : 'opacity-40'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                    : isDone
                      ? 'bg-emerald-900/40 text-emerald-400'
                      : 'bg-slate-800 text-slate-500'
                }`}
              >
                <Icon size={16} strokeWidth={1.75} className={isActive ? 'animate-pulse' : ''} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    className={`font-display font-semibold text-sm ${
                      isActive ? 'text-white' : isDone ? 'text-emerald-200' : 'text-slate-400'
                    }`}
                  >
                    {stage.label}
                  </h3>
                  {isActive && (
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 bg-emerald-300 rounded-full animate-bounce" />
                      <span
                        className="w-1 h-1 bg-emerald-300 rounded-full animate-bounce"
                        style={{ animationDelay: '0.15s' }}
                      />
                      <span
                        className="w-1 h-1 bg-emerald-300 rounded-full animate-bounce"
                        style={{ animationDelay: '0.3s' }}
                      />
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs mt-0.5 leading-relaxed ${
                    isActive ? 'text-emerald-100' : 'text-slate-500'
                  }`}
                >
                  {stage.detail}
                </p>
              </div>
            </div>
          );
        })}

        <div className="pt-2 mt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Layers size={11} className="text-emerald-400" />
            Stack: embeddings + LLM + heurística + feedback
          </span>
          <span className="tabular-nums">~10-15s</span>
        </div>
      </div>

      {/* Keyframes definidos inline para no contaminar el global CSS */}
      <style jsx>{`
        @keyframes matching-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes matching-spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes matching-orbit {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default MatchingAnimation;
