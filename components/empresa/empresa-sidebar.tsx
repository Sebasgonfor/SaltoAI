'use client';

/**
 * Navegación del área de empresa/reclutador con SIDEBAR.
 *
 * - Desktop (lg+): sidebar fijo a la izquierda — logo, navegación vertical con
 *   iconos y estado activo, y el menú de usuario abajo.
 * - Móvil (<lg): topbar sticky con hamburguesa + logo + usuario; la hamburguesa
 *   abre un drawer con la misma navegación.
 *
 * Mantiene el lenguaje visual de la app (slate + acento emerald, SaltoLogo,
 * UserButton, misma lógica de "activo" que NavLink con guard de hidratación).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  Home,
  MessageSquarePlus,
  Network,
  Wand2,
  Users,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Marca activo también en subrutas (ej. /empresa/matches/[needId]). */
  matchPrefix?: boolean;
  hint: string;
}

const NAV: NavItem[] = [
  { href: '/empresa', label: 'Inicio', icon: Home, matchPrefix: false, hint: 'Tu dashboard: necesidades, tareas y métricas.' },
  { href: '/empresa/chat', label: 'Publicar necesidad', icon: MessageSquarePlus, hint: 'Conversa con la IA para describir el rol.' },
  { href: '/empresa/matches', label: 'Mis matches', icon: Network, hint: 'Tus necesidades y shortlists por ICS.' },
  { href: '/empresa/entrevistador', label: 'Mi entrevistador', icon: Wand2, hint: 'Personaliza la entrevista con tu marca y comparte tu link.' },
  { href: '/empresa/candidatos', label: 'Mis candidatos', icon: Users, hint: 'Jóvenes que hicieron tu entrevista personalizada.' },
];

function useActive() {
  const pathname = usePathname() || '';
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (item: NavItem) =>
    hydrated &&
    (item.matchPrefix === false
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/'));
}

function NavList({
  isActive,
  onNavigate,
}: {
  isActive: (i: NavItem) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={item.hint}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-emerald-50 text-emerald-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Icon
              size={18}
              strokeWidth={1.75}
              className={active ? 'text-emerald-600' : 'text-slate-400'}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function EmpresaSidebar() {
  const isActive = useActive();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {/* ── Desktop: sidebar fijo ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-white border-r border-slate-200 z-40">
        <div className="h-16 flex items-center px-5 border-b border-slate-100 shrink-0">
          <Link href="/empresa" className="flex items-center">
            <SaltoLogo variant="full" size={36} />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList isActive={isActive} />
        </div>
        <div className="border-t border-slate-100 p-3 shrink-0">
          <UserButton menuPlacement="top" className="w-full" />
        </div>
      </aside>

      {/* ── Móvil: topbar + drawer ────────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-50 h-14 px-3 sm:px-4 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <Link href="/empresa" className="flex items-center shrink-0 min-w-0">
            <SaltoLogo variant="full" size={30} className="max-w-[calc(100vw-7rem)]" />
          </Link>
        </div>
        <UserButton />
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-label="Cerrar menú"
              onClick={close}
            />
            <motion.aside
              className="fixed top-0 left-0 bottom-0 w-[min(100vw-3rem,18rem)] bg-white z-50 lg:hidden shadow-xl overflow-y-auto flex flex-col"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
                <SaltoLogo variant="full" size={28} />
                <button
                  type="button"
                  onClick={close}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                  aria-label="Cerrar menú"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavList isActive={isActive} onNavigate={close} />
              </div>
              <div className="border-t border-slate-100 p-3 shrink-0">
                <UserButton menuPlacement="top" className="w-full" />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
