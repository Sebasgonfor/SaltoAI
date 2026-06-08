'use client';

/**
 * Misma transición de entrada que el resto de los módulos del Joven, pero para
 * la home (`/dashboard`). Mantiene la continuidad al navegar desde el sidebar.
 * Respeta prefers-reduced-motion.
 */

import { motion, useReducedMotion } from 'motion/react';

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
