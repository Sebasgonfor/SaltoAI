'use client';

import { useAuth } from '@/lib/auth-context';
import { UserButton } from '@/components/auth/user-button';
import { NavLink } from '@/components/nav-link';
import { useJovenProfileId } from '@/lib/hooks/use-joven-profile-id';

/**
 * Nav del joven. Cuatro items, cada uno con propósito claro:
 *
 *  - Entrevista       → /joven/chat
 *  - Mi Perfil        → /joven/perfil/{uid}
 *  - Oportunidades    → /joven/conectar
 *  - Mis Tareas       → /joven/tareas
 */
export function JovenNav({
  layout = 'row',
  onNavigate,
}: {
  layout?: 'row' | 'column';
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const jovenProfileId = useJovenProfileId();
  const perfilHref = jovenProfileId
    ? `/joven/perfil/${jovenProfileId}`
    : user?.uid
      ? `/joven/perfil/${user.uid}`
      : '/joven/perfil';

  const isCol = layout === 'column';
  const linkClass = isCol ? 'w-full' : undefined;

  return (
    <nav
      className={
        isCol
          ? 'flex flex-col items-stretch gap-0.5 p-3 text-sm font-medium'
          : 'flex gap-1 items-center text-sm font-medium'
      }
    >
      <NavLink
        href="/joven/chat"
        label="Entrevista"
        hint="Conversa con la IA para construir o actualizar tu Perfil de Evidencia."
        onNavigate={onNavigate}
        className={linkClass}
      />
      <NavLink
        href={perfilHref}
        label="Mi Perfil"
        matchPrefix
        hint="Tu Perfil de Evidencia: habilidades, evidencia citada y CV ATS."
        onNavigate={onNavigate}
        className={linkClass}
      />
      <NavLink
        href="/joven/conectar"
        label="Oportunidades"
        emphasis
        hint="Necesidades publicadas por empresas que encajan con tu perfil."
        onNavigate={onNavigate}
        className={linkClass}
      />
      <NavLink
        href="/joven/tareas"
        label="Mis Tareas"
        hint="Micro-tareas pagadas asignadas por empresas."
        onNavigate={onNavigate}
        className={linkClass}
      />
      {!isCol && (
        <>
          <div className="h-5 w-px bg-slate-200 mx-2" />
          <UserButton />
        </>
      )}
    </nav>
  );
}
