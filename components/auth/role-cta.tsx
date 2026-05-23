'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
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

/**
 * Botón inteligente para landing/hero. Comportamiento según estado:
 *  - Sin sesión: dispara Google Sign-In con `intendedRole`. Si el usuario
 *    es nuevo, queda registrado con ese rol y es llevado al `href`.
 *  - Sesión + rol correcto: navega directo al `href`.
 *  - Sesión + rol distinto: navega a la sección del rol existente
 *    (no muerde su perfil, no lo manda al RoleGate de pared).
 *  - Sesión sin rol: lleva a /onboarding/rol.
 */
export function RoleCTA({ role, href, children, variant = 'default', className }: Props) {
  const router = useRouter();
  const { user, account, loading, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (loading || busy) return;
    if (!user) {
      setBusy(true);
      try {
        const u = await signInWithGoogle(role);
        if (!u) return;
        // Tras el sign-in, el AuthProvider resuelve el rol. Llevamos al
        // destino esperado de este botón; el RoleGate cubrirá el caso
        // de rol existente distinto.
        router.push(href);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!account) {
      router.push(`/onboarding/rol?next=${encodeURIComponent(href)}`);
      return;
    }
    if (account.role === role) {
      router.push(href);
    } else {
      const otherHref = account.role === 'joven' ? '/joven/chat' : '/empresa/chat';
      router.push(otherHref);
    }
  };

  return (
    <Button
      size="lg"
      variant={variant}
      className={cn(className)}
      disabled={busy || loading}
      onClick={onClick}
    >
      {busy ? (
        <span className="inline-flex items-center gap-2">
          Abriendo Google… <ArrowRight size={18} />
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
