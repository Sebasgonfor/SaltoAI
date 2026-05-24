'use client';

/**
 * Hook para emitir señales IMPLÍCITAS (clicks, views, descargas) sin
 * ceremonia. Devuelve una función estable que el caller dispara cuando
 * ocurre el evento. Tracking del user automático si está disponible.
 *
 * Uso típico:
 *
 *   const emit = useEmitSignal();
 *   // en un onClick:
 *   emit({
 *     touchpoint: 'opportunity_click',
 *     targetType: 'need',
 *     targetId: opp.needId,
 *     icsAtTime: opp.ics,
 *   });
 *
 * Cuándo NO usarlo: para feedback explícito (el user dice algo activamente)
 * → usar `<FeedbackThumbs>`, `<FeedbackRating>` o `emitSignal()` directo.
 */

import { useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { emitSignal, type EmitSignalInput } from '@/lib/feedback';

type ImplicitInput = Omit<EmitSignalInput, 'kind' | 'userId' | 'userRole'> & {
  userId?: string;
  userRole?: 'joven' | 'empresa';
};

export function useEmitSignal() {
  const { user, account } = useAuth();

  return useCallback(
    (input: ImplicitInput) => {
      // Auto-llena userId y userRole si el caller no los pasó. La señal sale
      // anónima si no hay sesión — sigue siendo data útil (¿qué tan
      // interesante es el contenido para anónimos?).
      void emitSignal({
        ...input,
        kind: 'implicit',
        userId: input.userId ?? user?.uid,
        userRole: input.userRole ?? account?.role,
      });
    },
    [user, account]
  );
}
