import {
  Home,
  MessageSquareQuote,
  Network,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface EmpresaNavItem {
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  href: string;
  /** Marca activo también en subrutas (href + "/..."). */
  matchPrefix?: boolean;
  /** Realce sutil para la acción estrella (Publicar necesidad). */
  emphasis?: boolean;
}

/**
 * Páginas canónicas de la empresa — fuente única para sidebar (escritorio) y
 * barra inferior (móvil). El orden es el de navegación. Espeja el modelo del
 * joven (JOVEN_NAV) para mantener una sola arquitectura de navegación.
 */
export const EMPRESA_NAV: EmpresaNavItem[] = [
  { key: 'inicio', label: 'Inicio', shortLabel: 'Inicio', icon: Home, href: '/empresa' },
  {
    key: 'publicar',
    label: 'Publicar necesidad',
    shortLabel: 'Publicar',
    icon: MessageSquareQuote,
    href: '/empresa/chat',
    emphasis: true,
  },
  {
    key: 'matches',
    label: 'Mis matches',
    shortLabel: 'Matches',
    icon: Network,
    href: '/empresa/matches',
    matchPrefix: true,
  },
  {
    key: 'entrevistador',
    label: 'Mi entrevistador',
    shortLabel: 'Entrevistador',
    icon: Sparkles,
    href: '/empresa/entrevistador',
  },
  {
    key: 'candidatos',
    label: 'Mis candidatos',
    shortLabel: 'Candidatos',
    icon: Users,
    href: '/empresa/candidatos',
    matchPrefix: true,
  },
];

/** ¿La ruta actual corresponde a este ítem? (mismo criterio que NavLink) */
export function isEmpresaItemActive(
  pathname: string,
  href: string,
  matchPrefix?: boolean
): boolean {
  return matchPrefix ? pathname === href || pathname.startsWith(href + '/') : pathname === href;
}
