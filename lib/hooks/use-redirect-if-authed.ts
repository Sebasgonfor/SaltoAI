"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ROLE_DASHBOARD } from "@/lib/roles";

/**
 * Páginas de marketing / auth no deben retener a un usuario logueado.
 * Si hay sesión, lo mandamos a su home (ROLE_DASHBOARD) o, si aún no eligió
 * rol, a /onboarding/rol.
 *
 * Auth es client-side (Firebase) → corre tras hidratar, con guardas de
 * `loading`/`roleLoading` para no rebotar antes de tiempo.
 *
 * Devuelve `holding`: true en cuanto hay un usuario (vamos a redirigir).
 * Importante: NO bloquea a visitantes anónimos (la landing es marketing y
 * debe pintar al instante); solo retiene cuando existe una sesión.
 */
export function useRedirectIfAuthed(): boolean {
  const { user, account, loading, roleLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || roleLoading || !user) return;
    router.replace(account ? ROLE_DASHBOARD[account.role] : "/onboarding/rol");
  }, [user, account, loading, roleLoading, router]);

  return !!user;
}
