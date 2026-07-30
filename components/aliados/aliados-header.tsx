'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SaltoLogo } from '@/components/ui/salto-logo';
import { ResponsiveRoleHeader } from '@/components/layout/responsive-role-header';
import { cn } from '@/lib/utils';

function AliadosNav({
  layout,
  onNavigate,
}: {
  layout: 'row' | 'column';
  onNavigate?: () => void;
}) {
  const pathname = usePathname() || '';
  const isCol = layout === 'column';
  const items = [
    { href: '/aliados/impacto', label: 'Dashboard' },
    { href: '/', label: 'Volver al inicio' },
  ];

  return (
    <nav
      className={
        isCol
          ? 'flex flex-col gap-0.5 p-3 text-sm font-medium'
          : 'flex flex-wrap gap-1 justify-end text-sm font-medium'
      }
    >
      {items.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'px-3 py-2 rounded-md transition-colors',
              isCol && 'w-full',
              active
                ? 'text-slate-900 bg-slate-100'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AliadosHeader() {
  return (
    <ResponsiveRoleHeader
      logoHref="/"
      desktopNav={
        <div className="flex items-center gap-6 w-full justify-end">
          <div className="hidden lg:flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-slate-500 font-medium mr-auto">
            <SaltoLogo variant="icon" size={28} />
            <span>Portal aliados</span>
          </div>
          <AliadosNav layout="row" />
        </div>
      }
      drawerNav={(close) => <AliadosNav layout="column" onNavigate={close} />}
    />
  );
}
