'use client';

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

/**
 * Botón inteligente para landing/hero. Comportamiento según estado:
 *  - Sin sesión: lleva a /auth con rol y destino.
 *  - Sesión + rol correcto: navega directo al `href`.
 *  - Sesión + rol distinto: navega a la sección del rol existente.
 *  - Sesión sin rol: lleva a /onboarding/rol.
 */
export function RoleCTA({ role, href, children, variant = 'default', className }: Props) {
  const router = useRouter();
  const { user, account, loading } = useAuth();

  const onClick = () => {
    if (loading) return;
    if (!user) {
      router.push(`/auth?next=${encodeURIComponent(href)}&role=${role}`);
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
      disabled={loading}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
