'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth, type UserRole } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

interface Props {
  role: UserRole;
  /** Destino cuando el usuario ya está autenticado y autorizado. */
  href: string;
  /** Render del contenido interno del botón (igual estilo que el original). */
  children: React.ReactNode;
  variant?: 'default' | 'outline';
  className?: string;
}

const ROLE_LABEL: Record<UserRole, string> = {
  joven: 'joven',
  empresa: 'empresa',
};

const ROLE_DASHBOARD: Record<UserRole, string> = {
  joven: '/dashboard',
  empresa: '/empresa',
};

/**
 * Botón inteligente para la landing. Comportamiento según estado:
 *  - Sin sesión: lleva a /auth con el rol intencionado.
 *  - Sesión sin rol asignado: lleva a /onboarding/rol.
 *  - Sesión con MISMO rol: navega directo al `href` del botón.
 *  - Sesión con OTRO rol: en lugar del redirect silencioso al área propia
 *    (que hacía que los 4 CTAs de la landing terminaran TODOS en el mismo
 *    destino confundiendo al user), abrimos un confirm: o cerrás sesión
 *    para entrar con el otro rol, o te llevamos a tu dashboard. Sin engaño.
 */
export function RoleCTA({ role, href, children, variant = 'default', className }: Props) {
  const router = useRouter();
  const { user, account, loading, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    // Solo bloqueamos por `busy` (in-flight signOut). El `loading` del
    // AuthProvider puede tardar varios segundos resolviendo la sesión
    // persistida — bloqueábamos el botón innecesariamente.
    if (busy) return;

    if (!user) {
      router.push(`/auth?next=${encodeURIComponent(href)}&role=${role}`);
      return;
    }

    if (!account) {
      router.push(`/onboarding/rol?next=${encodeURIComponent(href)}`);
      return;
    }

    // Mismo rol → navega directo al destino esperado del botón.
    if (account.role === role) {
      router.push(account.interviewCompleted ? ROLE_DASHBOARD[account.role] : href);
      return;
    }

    // Rol distinto → preguntar al user qué quiere hacer. ANTES llevábamos
    // al área del rol existente sin avisar, lo que producía la queja
    // "los 4 botones llevan al mismo destino".
    const currentLabel = ROLE_LABEL[account.role];
    const targetLabel = ROLE_LABEL[role];
    const wantsSwitch =
      typeof window !== 'undefined' &&
      window.confirm(
        `Tu cuenta está registrada como ${currentLabel}.\n\n` +
          `Para usar Salto como ${targetLabel}, primero hay que cerrar sesión y volver a entrar con otra cuenta de Google.\n\n` +
          `Aceptar: cerrar sesión y entrar como ${targetLabel}.\n` +
          `Cancelar: ir a tu área de ${currentLabel}.`
      );

    if (!wantsSwitch) {
      // El user prefiere quedarse en su área. Cae en el dashboard de su
      // rol (no en el chat directo) — más útil para "ver qué tengo".
      router.push(ROLE_DASHBOARD[account.role]);
      return;
    }

    // El user quiere cambiar de rol → cerramos sesión y mandamos al
    // login con el rol intencionado preseteado.
    setBusy(true);
    try {
      await signOut();
      router.push(`/auth?next=${encodeURIComponent(href)}&role=${role}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="lg"
      variant={variant}
      className={cn(className)}
      disabled={busy}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
