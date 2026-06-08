import {
  Home,
  MessageSquareQuote,
  UserRound,
  Network,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

export interface JovenNavItem {
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Href estático. "Mi Perfil" se resuelve al id real en el shell. */
  href: string;
  /** Marca activo también en subrutas (href + "/..."). */
  matchPrefix?: boolean;
  /** Realce sutil para la acción estrella (Oportunidades). */
  emphasis?: boolean;
}

/**
 * Páginas canónicas del joven — fuente única para sidebar (escritorio) y
 * barra inferior (móvil). El orden es el de navegación.
 */
export const JOVEN_NAV: JovenNavItem[] = [
  { key: 'inicio', label: 'Inicio', shortLabel: 'Inicio', icon: Home, href: '/dashboard' },
  {
    key: 'entrevista',
    label: 'Entrevista',
    shortLabel: 'Entrevista',
    icon: MessageSquareQuote,
    href: '/joven/chat',
  },
  {
    key: 'perfil',
    label: 'Mi Perfil',
    shortLabel: 'Perfil',
    icon: UserRound,
    href: '/joven/perfil',
    matchPrefix: true,
  },
  {
    key: 'oportunidades',
    label: 'Oportunidades',
    shortLabel: 'Matches',
    icon: Network,
    href: '/joven/conectar',
    emphasis: true,
  },
  {
    key: 'tareas',
    label: 'Mis tareas',
    shortLabel: 'Tareas',
    icon: ListChecks,
    href: '/joven/tareas',
    matchPrefix: true,
  },
];

/** ¿La ruta actual corresponde a este ítem? (mismo criterio que NavLink) */
export function isItemActive(
  pathname: string,
  href: string,
  matchPrefix?: boolean
): boolean {
  return matchPrefix ? pathname === href || pathname.startsWith(href + '/') : pathname === href;
}
