'use client';

/**
 * Banner discreto que aparece DESPUÉS de una acción importante para pedir
 * feedback sin interrumpir el flow. Variantes:
 *   - thumbs: sí/no rápido.
 *   - rating: 1-5 estrellas.
 *   - dismissible: el user puede cerrar sin votar.
 *
 * Se persiste en localStorage si fue votado o cerrado, para que no aparezca
 * dos veces. El componente cliente solo monta si todavía no se votó/cerró.
 *
 * Pensado para flexibilidad: el caller decide variant + textos.
 */

import { useState } from 'react';
import { X, MessageSquareQuote } from 'lucide-react';
import { hasEmittedExplicit } from '@/lib/feedback';
import { FeedbackThumbs } from './thumbs';
import { FeedbackRating } from './rating';
import type { EmitSignalInput } from '@/lib/feedback';
import { useHydrated } from '@/hooks/use-hydrated';

interface Props extends Omit<EmitSignalInput, 'rating' | 'binary' | 'text' | 'kind'> {
  /** Headline visible (oración corta). */
  question: string;
  /** Subline opcional (contexto del por qué te preguntamos esto). */
  hint?: string;
  /** Tipo de respuesta esperada. */
  variant: 'thumbs' | 'rating';
  /** Si true, muestra una X para cerrar sin votar (registramos el dismiss). */
  dismissible?: boolean;
}

function lsDismissKey(touchpoint: string, targetId: string): string {
  return `salto.feedback.dismiss.${touchpoint}.${targetId}`;
}

function wasDismissed(touchpoint: string, targetId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(lsDismissKey(touchpoint, targetId)) !== null;
  } catch {
    return false;
  }
}

export function FeedbackInlinePrompt({
  question,
  hint,
  variant,
  dismissible = true,
  ...input
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const hydrated = useHydrated();

  // Solo montamos en cliente (hydrated) y si no votó ni cerró antes. Diferir a
  // hidratación evita leer localStorage en SSR y el hydration mismatch.
  const show =
    hydrated &&
    !dismissed &&
    !hasEmittedExplicit(input.touchpoint, input.targetId) &&
    !wasDismissed(input.touchpoint, input.targetId);

  if (!show) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(
        lsDismissKey(input.touchpoint, input.targetId),
        String(Date.now())
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="bg-gradient-to-r from-emerald-50/80 to-amber-50/40 border border-emerald-200/60 rounded-2xl px-4 py-3 flex items-start justify-between gap-4 flex-wrap"
      role="region"
      aria-label="Feedback rápido"
      data-feedback="prompt"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <MessageSquareQuote size={14} />
        </div>
        <div className="leading-snug">
          <div className="text-sm font-medium text-slate-900">{question}</div>
          {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
          <div className="mt-2.5">
            {variant === 'thumbs' ? (
              <FeedbackThumbs label="" thanksText="Gracias." {...input} />
            ) : (
              <FeedbackRating label="" thanksText="Gracias." {...input} />
            )}
          </div>
        </div>
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition flex-shrink-0"
          aria-label="Cerrar"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
