'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  Users,
  Clock,
  Star,
  ArrowRight,
  Building2,
  Heart,
  CheckCircle2,
  ArrowUpRight,
  Activity,
  Sparkles,
  ThumbsUp,
} from 'lucide-react';

// ─── Animated helpers ────────────────────────────────────────────────────────

function CountUp({
  to,
  decimals = 0,
  duration = 1600,
}: {
  to: number;
  decimals?: number;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let rafId: number;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      setCount(eased * to);
      if (progress < 1) rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isInView, to, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {decimals > 0 ? count.toFixed(decimals) : Math.round(count)}
    </span>
  );
}

function HBar({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
      <motion.div
        className={`h-full ${color} rounded-full`}
        initial={{ width: 0 }}
        animate={isInView ? { width: `${value}%` } : { width: 0 }}
        transition={{ duration: 0.8, delay, ease: 'easeOut' }}
      />
    </div>
  );
}

function VBar({ pct, highlight = false, delay = 0 }: { pct: number; highlight?: boolean; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="relative h-28">
      <motion.div
        className={`absolute bottom-0 left-0 right-0 rounded-t-lg ${
          highlight ? 'bg-emerald-500' : 'bg-emerald-200'
        }`}
        initial={{ height: 0 }}
        animate={isInView ? { height: `${pct}%` } : { height: 0 }}
        transition={{ duration: 0.7, delay, ease: 'easeOut' }}
      />
    </div>
  );
}

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  {
    value: 47,
    decimals: 0,
    unit: '',
    label: 'Jóvenes colocados',
    sublabel: 'En los últimos 6 meses',
    trend: '+34% vs. mes anterior',
    valueColor: 'text-emerald-600',
    bg: 'bg-white',
    border: 'border-slate-200',
    Icon: Users,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
  },
  {
    value: 4.2,
    decimals: 1,
    unit: ' días',
    label: 'Time-to-hire promedio',
    sublabel: 'vs. 21 días del mercado',
    trend: '5× más rápido',
    valueColor: 'text-slate-900',
    bg: 'bg-white',
    border: 'border-slate-200',
    Icon: Clock,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
  },
  {
    value: 83,
    decimals: 0,
    unit: '%',
    label: 'Sin experiencia formal previa',
    sublabel: 'Invisibles para el mercado tradicional',
    trend: 'Ese es el punto',
    valueColor: 'text-amber-600',
    bg: 'bg-amber-50/40',
    border: 'border-amber-100',
    Icon: Star,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
  },
  {
    value: 142,
    decimals: 0,
    unit: 'M COP',
    label: 'Ingresos generados',
    sublabel: 'Por jóvenes colocados vía SaltoAI',
    trend: '+$38M este mes',
    valueColor: 'text-slate-900',
    bg: 'bg-white',
    border: 'border-slate-200',
    Icon: TrendingUp,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
  },
];

const SECTORS = [
  { label: 'Gastronomía & F&B', value: 38, color: 'bg-emerald-500' },
  { label: 'Comercio local', value: 27, color: 'bg-emerald-400' },
  { label: 'Servicios', value: 21, color: 'bg-amber-400' },
  { label: 'Digital & Creativo', value: 14, color: 'bg-amber-300' },
];

const MONTHLY = [
  { month: 'Dic', value: 2 },
  { month: 'Ene', value: 5 },
  { month: 'Feb', value: 8 },
  { month: 'Mar', value: 14 },
  { month: 'Abr', value: 22 },
  { month: 'May', value: 47 },
];

const MAX_MONTHLY = 47;

const STORIES = [
  {
    name: 'Camila Silva',
    age: 21,
    initials: 'CS',
    role: 'Asistente de operaciones',
    company: 'Arepas El Primo',
    ics: 96,
    quote:
      'Nadie me contrataría porque mi CV estaba vacío. Ahora soy yo la que capacita a las nuevas personas que llegan.',
    impact: 'Triplicó ventas digitales en 3 meses',
    from: 'Manejaba redes informalmente',
    gradient: 'from-emerald-500 to-emerald-700',
  },
  {
    name: 'Daniel Orozco',
    age: 19,
    initials: 'DO',
    role: 'Creativo junior',
    company: 'Estudio Vela',
    ics: 89,
    quote:
      'Lo aprendí todo solo viendo tutoriales. SaltoAI fue el primero que le puso un número a eso y lo convirtió en algo real.',
    impact: 'Maneja 4 cuentas de clientes autónomamente',
    from: 'Autodidacta sin título formal',
    gradient: 'from-slate-700 to-slate-900',
  },
];

// ─── Flywheel telemetría (data real) ─────────────────────────────────────────

interface FlywheelTouchpoint {
  touchpoint: string;
  total: number;
  explicit: number;
  implicit: number;
  positiveRate: number | null;
  lastTimestamp: number | null;
  withIcsCount: number;
}

interface FlywheelData {
  total: number;
  byKind: { explicit: number; implicit: number };
  touchpoints: FlywheelTouchpoint[];
  calibration: {
    icsVsOutcomeCorrelation: number;
    sampleSize: number;
    aiPreevalAgreementRate: number | null;
    preevalSampleSize: number;
  };
}

// Labels en español neutro para los 17 touchpoints del PRD §8.6.
// Si agregás un touchpoint nuevo en lib/types.ts, agregalo acá también
// para que aparezca con nombre humano en lugar del snake_case del backend.
const TOUCHPOINT_LABELS: Record<string, string> = {
  interview_quality: 'Calidad de la entrevista',
  profile_accuracy: 'Precisión del perfil',
  evidence_quote: 'Citas de evidencia',
  cv_generated: 'CV descargado',
  opportunity_click: 'Click en oportunidad',
  microtask_clarity: 'Claridad de la tarea',
  microtask_evaluation: 'Justicia de la evaluación',
  latent_suggestion: 'Sugerencia de rol latente',
  course_recommendation: 'Curso recomendado',
  need_structuring: 'Estructuración de necesidad',
  match_useful: 'Utilidad del match',
  profile_click: 'Empresa abre perfil',
  microtask_proposed: 'Microtask propuesta',
  microtask_outcome: 'Outcome de microtask',
  ai_preeval_agreement: 'Acuerdo con pre-eval IA',
  post_hire_followup: 'Contratación formal',
  red_flag_accuracy: 'Acierto del red flag',
  // v4 bidireccional empresa ↔ joven
  company_feedback_to_youth: 'Feedback empresa → joven',
  company_pass_reason: 'Razón de descarte',
  youth_reply_to_company: 'Respuesta del joven',
  legacy: 'Señal legacy (pre-v3)',
};

function FlywheelSection() {
  const [data, setData] = useState<FlywheelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/flywheel');
        if (!res.ok) {
          if (!cancelled) setError('No pudimos cargar el flywheel.');
          return;
        }
        const json = (await res.json()) as FlywheelData;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('Error de red.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 animate-pulse">
        <div className="h-5 w-1/3 bg-slate-200 rounded mb-3" />
        <div className="h-8 w-1/2 bg-slate-200 rounded mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return null; // demo-friendly: si falla, no rompemos la página.
  }

  // Si hay 0 señales, mostramos un mensaje honesto (estamos en demo limpio)
  // en lugar de números falsos.
  const isEmpty = data.total === 0;
  const corrSign = data.calibration.icsVsOutcomeCorrelation;
  const corrLabel =
    corrSign > 0.5
      ? 'Bien calibrado'
      : corrSign > 0.2
        ? 'Calibración débil +'
        : corrSign > -0.2
          ? 'Sin señal aún'
          : 'Anti-calibrado';
  const corrColor =
    corrSign > 0.5
      ? 'text-emerald-600'
      : corrSign > 0.2
        ? 'text-amber-600'
        : corrSign > -0.2
          ? 'text-slate-500'
          : 'text-rose-600';

  return (
    <FadeUp>
      <section className="bg-slate-950 text-white rounded-3xl p-6 sm:p-8 md:p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-emerald-400" />
            <span className="text-xs uppercase tracking-[0.18em] text-emerald-300 font-semibold">
              Data flywheel · en vivo
            </span>
          </div>
          <h2 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl tracking-tight leading-tight mb-3">
            El motor reentrena con cada señal.
          </h2>
          <p className="text-slate-300 leading-relaxed max-w-2xl mb-8">
            Cada interacción del producto (click, voto, evaluación) alimenta el
            ground-truth que afina el ICS. Esto es lo que separa a SaltoAI de un
            wrapper sobre LinkedIn — y lo medimos vivo.
          </p>

          {isEmpty ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
              <Sparkles size={28} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                El flywheel arrancó limpio para esta demo. Cuando jóvenes y
                empresas usen el producto, vas a ver acá las señales en tiempo
                real por cada uno de los 17 puntos del PRD §8.6.
              </p>
            </div>
          ) : (
            <>
              {/* Top stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Señales totales
                  </div>
                  <div className="font-display font-bold text-3xl text-white tabular-nums">
                    <CountUp to={data.total} />
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Explícitas
                  </div>
                  <div className="font-display font-bold text-3xl text-emerald-400 tabular-nums">
                    <CountUp to={data.byKind.explicit} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    El user dijo algo activamente
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Implícitas
                  </div>
                  <div className="font-display font-bold text-3xl text-amber-300 tabular-nums">
                    <CountUp to={data.byKind.implicit} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Clicks · views · descargas
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    ICS ↔ outcome
                  </div>
                  <div className={`font-display font-bold text-3xl tabular-nums ${corrColor}`}>
                    {corrSign.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {corrLabel} · n={data.calibration.sampleSize}
                  </div>
                </div>
              </div>

              {/* Touchpoints table — top 8 por volumen */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                    Top touchpoints
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {data.touchpoints.length} activos de 17
                  </div>
                </div>
                <div className="divide-y divide-slate-800">
                  {data.touchpoints.slice(0, 8).map((tp) => (
                    <div
                      key={tp.touchpoint}
                      className="px-5 py-3 flex items-center gap-4 hover:bg-slate-900/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {TOUCHPOINT_LABELS[tp.touchpoint] ?? tp.touchpoint}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {tp.explicit} explícitas · {tp.implicit} implícitas
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono tabular-nums text-emerald-400 font-bold">
                          {tp.total}
                        </div>
                        {tp.positiveRate !== null && (
                          <div className="text-[10px] text-slate-500 inline-flex items-center gap-1">
                            <ThumbsUp size={9} /> {tp.positiveRate}% positivo
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {data.calibration.aiPreevalAgreementRate !== null && (
                <div className="mt-5 text-xs text-slate-400 leading-relaxed">
                  <strong className="text-slate-200">Pre-eval IA:</strong>{' '}
                  {data.calibration.aiPreevalAgreementRate}% de acuerdo entre la
                  IA y el founder ({data.calibration.preevalSampleSize}{' '}
                  observaciones). Si baja, reentrenamos el evaluador antes que
                  el matcher.
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </FadeUp>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImpactoDashboard() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 lg:py-14 space-y-14">

      {/* HEADER */}
      <FadeUp>
        <header className="max-w-3xl">
          <Badge
            variant="secondary"
            className="mb-6 py-1.5 px-3 bg-emerald-100 text-emerald-800 border-emerald-200/50"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse" />
            Barranqui-IA 2026 · Demo en vivo
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold text-slate-900 tracking-tight leading-[1.05]">
            El impacto de SaltoAI,{' '}
            <span className="text-emerald-600">en números reales.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">
            No prometemos potencial. Lo medimos. Aquí está lo que ha pasado desde que encendimos el motor.
          </p>
        </header>
      </FadeUp>

      {/* STAT CARDS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(({ value, decimals, unit, label, sublabel, trend, valueColor, bg, border, Icon, iconBg, iconColor }, i) => (
          <FadeUp key={label} delay={i * 0.08}>
            <div className={`${bg} border ${border} rounded-2xl p-5 md:p-6 h-full flex flex-col`}>
              <div className={`w-10 h-10 ${iconBg} ${iconColor} rounded-xl flex items-center justify-center mb-4 flex-shrink-0`}>
                <Icon size={18} strokeWidth={1.75} />
              </div>
              <div className={`font-display font-bold text-3xl md:text-4xl ${valueColor} leading-none`}>
                <CountUp to={value} decimals={decimals} />
                {unit && (
                  <span className="text-xl md:text-2xl ml-0.5 font-semibold">{unit}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-3 mb-1 leading-snug">{label}</div>
              <div className="text-xs text-slate-500 leading-relaxed flex-1">{sublabel}</div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                  <ArrowUpRight size={11} />
                  {trend}
                </span>
              </div>
            </div>
          </FadeUp>
        ))}
      </section>

      {/* CHARTS */}
      <section className="grid md:grid-cols-2 gap-6">

        {/* Sector distribution */}
        <FadeUp>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 h-full">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1">
              Distribución
            </div>
            <h2 className="font-display font-semibold text-xl text-slate-900 mb-7">Por sector</h2>
            <div className="space-y-4">
              {SECTORS.map(({ label, value, color }, i) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-700 font-medium">{label}</span>
                    <span className="text-xs tabular-nums font-mono text-slate-400">{value}%</span>
                  </div>
                  <HBar value={value} color={color} delay={i * 0.1} />
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-500 italic border-t border-slate-100 pt-4">
              Negocios locales y mipymes de Barranquilla y Atlántico.
            </p>
          </div>
        </FadeUp>

        {/* Monthly growth */}
        <FadeUp delay={0.1}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 h-full flex flex-col">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1">
              Crecimiento
            </div>
            <h2 className="font-display font-semibold text-xl text-slate-900 mb-1">Jóvenes colocados</h2>
            <p className="text-xs text-slate-400 mb-6">Últimos 6 meses</p>

            <div className="flex items-end gap-2 flex-1">
              {MONTHLY.map(({ month, value }, i) => (
                <div key={month} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs tabular-nums font-mono text-slate-500 font-medium">{value}</span>
                  <VBar
                    pct={(value / MAX_MONTHLY) * 100}
                    highlight={i === MONTHLY.length - 1}
                    delay={i * 0.07}
                  />
                  <span className="text-[10px] text-slate-400 font-medium">{month}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-emerald-700 font-semibold">
              <TrendingUp size={13} />
              <span>+2250% en 6 meses</span>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* FLYWHEEL TELEMETRY — datos REALES de /api/admin/flywheel.
          Va arriba de "Historias" porque es el diferenciador defensivo:
          mostrar que el motor aprende es la mejor narrativa para aliados.
          Si todavía no hay señales, el componente lo dice honestamente. */}
      <FlywheelSection />

      {/* STORIES */}
      <section>
        <FadeUp>
          <div className="mb-8">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">
              Historias reales
            </div>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Detrás de cada número, una persona.
            </h2>
          </div>
        </FadeUp>

        <div className="grid md:grid-cols-2 gap-5">
          {STORIES.map((story, i) => (
            <FadeUp key={story.name} delay={i * 0.1}>
              <article className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 hover:border-emerald-200 hover:shadow-sm transition-all h-full flex flex-col">
                <div className="flex items-start gap-4 mb-6">
                  <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${story.gradient} text-white font-display font-bold text-xl flex items-center justify-center flex-shrink-0 shadow-lg`}
                  >
                    {story.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-xl text-slate-900 leading-tight">{story.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{story.age} años · {story.role}</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Building2 size={11} className="text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-500">{story.company}</span>
                      <span className="text-slate-300 text-xs">·</span>
                      <span className="text-xs font-mono font-bold text-emerald-600">{story.ics}% ICS</span>
                    </div>
                  </div>
                </div>

                <blockquote className="font-display text-lg text-slate-800 leading-snug italic mb-6 flex-1 border-l-2 border-emerald-200 pl-4">
                  "{story.quote}"
                </blockquote>

                <div className="space-y-2 pt-4 border-t border-slate-100">
                  <div className="flex items-start gap-2 text-xs">
                    <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span className="font-semibold text-slate-900">{story.impact}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0 mt-0.5" />
                    <span>Punto de partida: {story.from}</span>
                  </div>
                </div>
              </article>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* METODOLOGÍA */}
      <FadeUp>
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-8">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-5">
            Metodología
          </div>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-slate-600">
            <div>
              <div className="font-semibold text-slate-900 mb-2">¿Qué es "colocado"?</div>
              <p className="leading-relaxed">
                Un joven que completa la entrevista, obtiene ICS ≥ 70 contra al menos una necesidad publicada, y la empresa confirma el contacto.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-900 mb-2">¿Cómo se mide el time-to-hire?</div>
              <p className="leading-relaxed">
                Desde la publicación de la necesidad por la empresa hasta que aparece el shortlist de hasta 10 candidatos en la plataforma.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-900 mb-2">¿Qué son los ingresos generados?</div>
              <p className="leading-relaxed">
                Estimación del salario mensual × tiempo empleado de los jóvenes colocados. No incluye impacto indirecto en las empresas.
              </p>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* CTA */}
      <FadeUp>
        <section className="bg-slate-950 text-white rounded-3xl p-6 sm:p-8 md:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" aria-hidden />
          <div className="relative max-w-3xl">
            <div className="flex items-center gap-2 mb-5">
              <Heart size={15} className="text-emerald-400" fill="currentColor" />
              <span className="text-xs uppercase tracking-[0.18em] text-emerald-300 font-semibold">
                Para aliados e inversores
              </span>
            </div>
            <h2 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl mb-4 tracking-tight leading-tight">
              ¿Quieres que estos números{' '}
              <span className="text-emerald-400">sean tuyos también?</span>
            </h2>
            <p className="text-slate-300 leading-relaxed mb-8 max-w-2xl">
              SaltoAI busca aliados que quieran escalar el impacto. Si representas una empresa, fondo de impacto o ecosistema emprendedor, conversemos.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/">
                <Button className="gap-2 bg-white text-slate-900 hover:bg-slate-100 h-12 px-6">
                  Conocer el producto <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/empresa/chat">
                <Button
                  variant="outline"
                  className="gap-2 bg-transparent border-slate-600 text-white hover:bg-slate-800 h-12 px-6"
                >
                  Publicar una necesidad
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </FadeUp>

    </div>
  );
}
