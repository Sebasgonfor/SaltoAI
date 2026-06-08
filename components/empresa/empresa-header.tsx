'use client';

import { NavLink } from '@/components/nav-link';
import { UserButton } from '@/components/auth/user-button';
import { ResponsiveRoleHeader } from '@/components/layout/responsive-role-header';

function EmpresaNav({
  layout,
  onNavigate,
}: {
  layout: 'row' | 'column';
  onNavigate?: () => void;
}) {
  const isCol = layout === 'column';
  return (
    <nav
      className={
        isCol
          ? 'flex flex-col items-stretch gap-0.5 p-3 text-sm font-medium'
          : 'flex gap-0.5 sm:gap-1 items-center text-sm font-medium min-w-0'
      }
    >
      <NavLink
        href="/empresa"
        label="Inicio"
        matchPrefix={false}
        hint="Tu dashboard: necesidades publicadas, micro-tareas activas y métricas."
        onNavigate={onNavigate}
        className={isCol ? 'w-full' : undefined}
      />
      <NavLink
        href="/empresa/chat"
        label="Publicar necesidad"
        shortLabel={isCol ? undefined : 'Publicar'}
        hint="Conversa con la IA para describir el rol."
        onNavigate={onNavigate}
        className={isCol ? 'w-full' : undefined}
      />
      <NavLink
        href="/empresa/matches"
        label="Mis matches"
        hint="Tus necesidades y shortlists por ICS."
        onNavigate={onNavigate}
        className={isCol ? 'w-full' : undefined}
      />
      <NavLink
        href="/empresa/entrevistador"
        label="Mi entrevistador"
        shortLabel={isCol ? undefined : 'Entrevistador'}
        hint="Personaliza la entrevista con tu marca y comparte tu link."
        onNavigate={onNavigate}
        className={isCol ? 'w-full' : undefined}
      />
      <NavLink
        href="/empresa/candidatos"
        label="Mis candidatos"
        shortLabel={isCol ? undefined : 'Candidatos'}
        hint="Jóvenes que hicieron tu entrevista personalizada."
        onNavigate={onNavigate}
        className={isCol ? 'w-full' : undefined}
      />
    </nav>
  );
}

export function EmpresaHeader() {
  return (
    <ResponsiveRoleHeader
      desktopNav={<EmpresaNav layout="row" />}
      drawerNav={(close) => <EmpresaNav layout="column" onNavigate={close} />}
      mobileTrailing={<UserButton />}
      desktopTrailing={<UserButton />}
    />
  );
}
