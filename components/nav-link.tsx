'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Props {
  href: string;
  label: string;
  /** Si true, marca activo también cuando el pathname empieza con `href` (rutas con subpáginas). */
  matchPrefix?: boolean;
  /** Texto explicativo que aparece en tooltip al hacer hover — UX profesional. */
  hint?: string;
  /** Variante visual para CTAs destacados (ej. "Oportunidades" en el joven). */
  emphasis?: boolean;
}

/**
 * Link de navegación con estado activo automático.
 *
 * Antes los layouts (joven, empresa) renderizaban un `<Link>` con la clase de
 * "activo" hardcodeada — siempre se veía resaltado el mismo item sin importar
 * la ruta. Este componente lee `usePathname()` y aplica el estilo activo solo
 * cuando corresponde.
 *
 * matchPrefix=true es útil para items que cubren un árbol de rutas (ej. "Mis
 * matches" debe seguir activo en /empresa/matches/{needId}).
 */
export function NavLink({ href, label, matchPrefix = true, hint, emphasis = false }: Props) {
  const pathname = usePathname() || '';
  const isActive = matchPrefix
    ? pathname === href || pathname.startsWith(href + '/')
    : pathname === href;

  return (
    <Link
      href={href}
      title={hint}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'px-3 py-1.5 rounded-md transition-colors',
        isActive
          ? emphasis
            ? 'text-emerald-700 bg-emerald-50'
            : 'text-slate-900 bg-slate-100'
          : emphasis
            ? 'text-emerald-700/80 hover:text-emerald-800 hover:bg-emerald-50'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
      )}
    >
      {label}
    </Link>
  );
}
