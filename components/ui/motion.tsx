'use client';

/**
 * Primitivas de animación reutilizables para los módulos del Joven.
 *
 * Todas respetan `prefers-reduced-motion`: si el usuario lo pide, renderizan
 * el contenido estático sin envoltorio `motion` (cero animación, cero costo).
 * Solo animan `opacity`/`transform` → compositor GPU, sin reflow.
 *
 *   <Reveal>         — aparece al entrar al viewport (scroll reveal).
 *   <Stagger>        — contenedor que escalona la entrada de sus <StaggerItem>.
 *   <StaggerItem>    — hijo escalonado.
 *   <CountUp>        — número que cuenta hasta su valor al entrar en pantalla.
 */

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  animate,
  type Variants,
} from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Curva "easeOutExpo" suave — coincide con la librería CSS en globals.css.
const EASE = [0.22, 1, 0.36, 1] as const;

// ─── Reveal ────────────────────────────────────────────────────────────────

export function Reveal({
  children,
  className,
  delay = 0,
  y = 14,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// ─── Stagger ───────────────────────────────────────────────────────────────

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export function Stagger({
  children,
  className,
  stagger = 0.07,
  delay = 0,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: '-60px' }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

// ─── Collapse ──────────────────────────────────────────────────────────────

/**
 * Contenido plegable con animación de apertura Y cierre (height + opacity).
 * Estándar para todas las tarjetas desplegables. Respeta reduced-motion
 * (muestra/oculta instantáneo). Pasá tu propio padding/clase en `className`.
 */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return open ? <div className={className}>{children}</div> : null;
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className={`overflow-hidden ${className ?? ''}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── CountUp ───────────────────────────────────────────────────────────────

export function CountUp({
  value,
  duration = 1.1,
  decimals = 0,
  className,
  prefix = '',
  suffix = '',
  format,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  /** Formateador a medida (p. ej. `n => n.toLocaleString('es-CO')`). */
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      // Sin animación: fijamos el valor final directo (intencional).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  const text = format
    ? format(decimals === 0 ? Math.round(display) : Number(display.toFixed(decimals)))
    : display.toFixed(decimals);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
