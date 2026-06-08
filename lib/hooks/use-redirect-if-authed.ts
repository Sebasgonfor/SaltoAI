"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ROLE_DASHBOARD } from "@/lib/roles";

/**
 * Páginas de marketing / auth no deben retener a un usuario logueado.
 * Si hay sesión CON rol resuelto, lo mandamos a su home (ROLE_DASHBOARD).
 *
 * Auth es client-side (Firebase) → esto corre tras hidratar, con guardas de
 * `loading`/`roleLoading` para no rebotar antes de tiempo ni parpadear.
 *
 * Devuelve `holding`: true mientras se resuelve la sesión o se va a redirigir.
 * La página debe mostrar un placeholder mínimo y NO renderizar el contenido
 * de marketing mientras `holding` sea true (evita el flash de la landing).
 */
export function useRedirectIfAuthed(): boolean {
  const { user, account, loading, roleLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || roleLoading) return;
    if (user && account) {
      router.replace(ROLE_DASHBOARD[account.role]);
    }
  }, [user, account, loading, roleLoading, router]);

  // Aún resolviendo, o ya hay sesión con rol (vamos a redirigir).
  return loading || roleLoading || (!!user && !!account);
}
