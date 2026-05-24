'use client';

import { useAuth } from '@/lib/auth-context';
import { UserButton } from '@/components/auth/user-button';
import { NavLink } from '@/components/nav-link';

/**
 * Nav del joven. Cuatro items, cada uno con propósito claro:
 *
 *  - Entrevista       → /joven/chat
 *      Conversación con la IA que construye/actualiza el Perfil de Evidencia.
 *
 *  - Mi Perfil        → /joven/perfil/{uid} (si hay sesión) | /joven/perfil
 *      Vista del Perfil de Evidencia: skills, traits, evidencia citada, CV ATS.
 *      Cuando el usuario tiene sesión Google, vamos directo a su perfil por
 *      uid; sin sesión, /joven/perfil hace lookup en localStorage del último.
 *
 *  - Oportunidades    → /joven/conectar
 *      Necesidades publicadas por empresas que matchean con tu perfil, con %
 *      ICS estimado. Antes se llamaba "Empresas" — confuso: no son perfiles
 *      de empresas, son ofertas concretas.
 *
 *  - Mis Tareas       → /joven/tareas
 *      Micro-tareas pagadas asignadas por empresas (audiciones reales).
 */
export function JovenNav() {
  const { user } = useAuth();
  // Si hay sesión, "Mi Perfil" va directo al perfil de este usuario.
  // Sin sesión, /joven/perfil hace fallback a localStorage o muestra empty state.
  const perfilHref = user?.uid ? `/joven/perfil/${user.uid}` : '/joven/perfil';

  return (
    <nav className="flex gap-1 items-center text-sm font-medium">
      <NavLink
        href="/joven/chat"
        label="Entrevista"
        hint="Conversa con la IA para construir o actualizar tu Perfil de Evidencia."
      />
      <NavLink
        href={perfilHref}
        label="Mi Perfil"
        // El "Mi Perfil" debe quedar activo en cualquier ruta /joven/perfil/*
        // (incluido el redirect intermedio sin id).
        matchPrefix
        hint="Tu Perfil de Evidencia: habilidades, evidencia citada y CV ATS para descargar."
      />
      <NavLink
        href="/joven/conectar"
        label="Oportunidades"
        emphasis
        hint="Necesidades publicadas por empresas que encajan con tu perfil (ranked por ICS)."
      />
      <NavLink
        href="/joven/tareas"
        label="Mis Tareas"
        hint="Micro-tareas pagadas asignadas por empresas — audiciones reales que suman a tu perfil."
      />
      <div className="h-5 w-px bg-slate-200 mx-2" />
      <UserButton />
    </nav>
  );
}
