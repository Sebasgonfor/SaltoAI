import {
  Home,
  MessageSquareQuote,
  UserRound,
  Network,
  ListChecks,
  FileText,
  FolderOpen,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

/** Sub-sección de un ítem (módulo del perfil), una ruta real propia. */
export interface JovenSubItem {
  key: string;
  label: string;
  /** Segmento de ruta bajo el href del padre (p. ej. "documentos"). */
  seg: string;
  icon: LucideIcon;
}

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
  /** Sub-secciones jerárquicas que se muestran indentadas cuando el ítem
   *  está activo (escritorio). El padre lleva a la vista "Resumen". */
  children?: JovenSubItem[];
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
    children: [
      { key: 'cv', label: 'Hoja de vida', seg: 'hoja-de-vida', icon: FileText },
      { key: 'documentos', label: 'Documentos', seg: 'documentos', icon: FolderOpen },
      { key: 'potencial', label: 'Potencial', seg: 'potencial', icon: TrendingUp },
    ],
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
