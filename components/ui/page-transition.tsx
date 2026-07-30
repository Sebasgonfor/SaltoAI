'use client';

/**
 * Transición de entrada de página, reutilizada por los `template.tsx` de cada
 * sección del Joven. Se monta en hojas (por debajo de los layouts con datos),
 * así anima SOLO el contenido de la página sin re-montar providers/layouts
 * superiores (p. ej. el ProfileProvider de "Mi Perfil"). Respeta
 * prefers-reduced-motion.
 */

import { motion, useReducedMotion } from 'motion/react';

export function PageTransition({ children }: { children: React.ReactNode }) {
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

export default PageTransition;
