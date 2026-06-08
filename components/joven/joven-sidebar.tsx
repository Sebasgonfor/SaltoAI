'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import {
  JOVEN_NAV,
  isItemActive,
  type JovenNavItem,
  type JovenSubItem,
} from './joven-nav-items';

/**
 * Sub-navegación jerárquica: cada módulo del perfil es una ruta real
 * (`${baseHref}/${seg}`). El activo se resuelve por pathname.
 */
function PerfilSubNav({
  baseHref,
  items,
  pathname,
}: {
  baseHref: string;
  items: JovenSubItem[];
  pathname: string;
}) {
  return (
    <div className="mt-0.5 mb-1 ml-[1.45rem] flex flex-col gap-0.5 border-l border-slate-200/80 pl-2.5">
      {items.map((sub) => {
        const href = `${baseHref}/${sub.seg}`;
        const active = pathname === href;
        const SubIcon = sub.icon;
        return (
          <Link
            key={sub.key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
              active
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50',
            ].join(' ')}
          >
            <SubIcon
              size={15}
              strokeWidth={1.9}
              className={active ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}
            />
            {sub.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Sidebar de la app del joven (escritorio, ≥md). Segunda capa neutral cálida
 * separada del contenido por un hairline. Activo = pill emerald (sin stripe
 * lateral). Cuenta abajo. "Mi Perfil" despliega sus sub-secciones cuando estás
 * dentro del perfil.
 */
export function JovenSidebar({ resolveHref }: { resolveHref: (item: JovenNavItem) => string }) {
  const pathname = usePathname() ?? '';
  const reduce = useReducedMotion();

  // Grupos desplegables abiertos. Arranca abierto el que está activo y se
  // auto-abre al navegar dentro de él, sin forzar el cierre manual del usuario.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const item of JOVEN_NAV) {
      if (item.children?.length && isItemActive(pathname, item.href, item.matchPrefix)) {
        s.add(item.key);
      }
    }
    return s;
  });

  useEffect(() => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const item of JOVEN_NAV) {
        if (
          item.children?.length &&
          isItemActive(pathname, item.href, item.matchPrefix) &&
          !next.has(item.key)
        ) {
          next.add(item.key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname]);

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-slate-200/70 bg-[#F4F2EC]">
      <div className="h-16 flex items-center px-5 shrink-0">
        <Link href="/dashboard" className="flex items-center" aria-label="Inicio">
          <SaltoLogo variant="full" size={52} />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
        {JOVEN_NAV.map((item) => {
          const href = resolveHref(item);
          const active = isItemActive(pathname, item.href, item.matchPrefix);
          const Icon = item.icon;
          const hasChildren = !!item.children?.length;
          const open = hasChildren && openKeys.has(item.key);
          return (
            <div key={item.key} className="flex flex-col">
              <div
                className={[
                  'group relative flex items-center rounded-xl pr-1 transition-colors duration-150',
                  active
                    ? 'text-emerald-700'
                    : item.emphasis
                      ? 'text-emerald-700/80 hover:bg-emerald-50/60'
                      : 'text-slate-600 hover:bg-slate-200/50',
                ].join(' ')}
              >
                {/* Píldora activa compartida: se desliza entre ítems con layoutId. */}
                {active && (
                  <motion.span
                    layoutId={reduce ? undefined : 'joven-sidebar-active'}
                    className="absolute inset-0 rounded-xl bg-emerald-50"
                    transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                    aria-hidden
                  />
                )}
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'relative z-10 flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    active
                      ? 'text-emerald-700'
                      : item.emphasis
                        ? 'text-emerald-700/80 group-hover:text-emerald-800'
                        : 'text-slate-600 group-hover:text-slate-900',
                  ].join(' ')}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.9}
                    className={active ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}
                  />
                  {item.label}
                </Link>

                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => toggle(item.key)}
                    aria-expanded={open}
                    aria-label={open ? `Contraer ${item.label}` : `Expandir ${item.label}`}
                    className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-600"
                  >
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
                    />
                  </button>
                )}
              </div>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="subnav"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <PerfilSubNav baseHref={href} items={item.children!} pathname={pathname} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-200/70 p-3">
        <UserButton className="w-full" />
      </div>
    </aside>
  );
}
