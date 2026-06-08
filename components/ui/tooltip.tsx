'use client';

/**
 * Tooltip propio de SaltoAI (NO el nativo del navegador). Se muestra al hacer
 * hover o focus del trigger; accesible (role="tooltip" + aria-describedby) y
 * respeta prefers-reduced-motion. Úsalo en lugar de `title=""`.
 *
 *   <Tooltip content="Qué significa esto">
 *     <button>Pulso laboral</button>
 *   </Tooltip>
 *
 * `content` puede ser texto o JSX. `side` controla la posición (top por
 * defecto). El trigger debe poder recibir foco para a11y (un botón, link, o
 * cualquier elemento con tabIndex).
 */

import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

type Side = 'top' | 'bottom' | 'left' | 'right';

const POS: Record<Side, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const ARROW: Record<Side, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 -mt-1',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1',
  left: 'left-full top-1/2 -translate-y-1/2 -ml-1',
  right: 'right-full top-1/2 -translate-y-1/2 -mr-1',
};

const OFFSET: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: 4 },
  bottom: { x: 0, y: -4 },
  left: { x: 4, y: 0 },
  right: { x: -4, y: 0 },
};

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const id = useId();
  const off = OFFSET[side];

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            id={id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: off.x, y: off.y }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: off.x, y: off.y }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-none absolute z-50 w-max max-w-[15rem] rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-white shadow-lg ${POS[side]} ${className ?? ''}`}
          >
            {content}
            <span
              aria-hidden
              className={`absolute h-2 w-2 rotate-45 bg-slate-900 ${ARROW[side]}`}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export default Tooltip;
