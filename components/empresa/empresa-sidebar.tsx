'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { UserButton } from '@/components/auth/user-button';
import { EMPRESA_NAV, isEmpresaItemActive } from './empresa-nav-items';

/**
 * Sidebar de la app de la empresa (escritorio, ≥md). Mismo lenguaje visual que
 * el del joven: segunda capa neutral cálida separada por un hairline, activo =
 * pill emerald (sin stripe lateral), cuenta abajo.
 */
export function EmpresaSidebar() {
  const pathname = usePathname() ?? '';

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-slate-200/70 bg-[#F4F2EC]">
      <div className="h-16 flex items-center px-5 shrink-0">
        <Link href="/empresa" className="flex items-center" aria-label="Inicio">
          <SaltoLogo variant="full" size={52} />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
        {EMPRESA_NAV.map((item) => {
          const active = isEmpresaItemActive(pathname, item.href, item.matchPrefix);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                active
                  ? 'bg-emerald-50 text-emerald-700'
                  : item.emphasis
                    ? 'text-emerald-700/80 hover:text-emerald-800 hover:bg-emerald-50/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50',
              ].join(' ')}
            >
              <Icon
                size={18}
                strokeWidth={1.9}
                className={active ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200/70 p-3">
        <UserButton className="w-full" />
      </div>
    </aside>
  );
}
