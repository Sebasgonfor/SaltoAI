'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { JOVEN_NAV, isItemActive, type JovenNavItem } from './joven-nav-items';

/**
 * Barra de pestañas inferior (móvil, <md). Reemplaza el drawer hamburguesa.
 * Ícono + microlabel; activo en emerald. Respeta el safe-area inferior.
 */
export function JovenBottomNav({ resolveHref }: { resolveHref: (item: JovenNavItem) => string }) {
  const pathname = usePathname() ?? '';
  const reduce = useReducedMotion();

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-[#FAFAF7]/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegación principal"
    >
      <ul className="grid grid-cols-5">
        {JOVEN_NAV.map((item) => {
          const href = resolveHref(item);
          const active = isItemActive(pathname, item.href, item.matchPrefix);
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex flex-col items-center justify-center gap-0.5 h-16 text-[10px] font-medium transition-colors duration-150 active:scale-90 active:transition-transform',
                  active ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800',
                ].join(' ')}
              >
                <span className="relative flex items-center justify-center px-3 py-1">
                  {active && (
                    <motion.span
                      layoutId={reduce ? undefined : 'joven-bottomnav-active'}
                      className="absolute inset-0 rounded-full bg-emerald-50"
                      transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                      aria-hidden
                    />
                  )}
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.1 : 1.8}
                    className="relative z-10"
                  />
                </span>
                {item.shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
