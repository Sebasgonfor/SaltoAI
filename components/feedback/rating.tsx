'use client';

/**
 * Primitive de feedback con escala 1-5 estrellas. Para touchpoints donde
 * "útil/no útil" pierde matiz: calidad de la entrevista, precisión del
 * perfil, justicia de la evaluación de la IA.
 *
 * UX:
 *  - Hover preview (la estrella iluminada bajo el cursor + las anteriores).
 *  - Click confirma; se manda al server fire-and-forget.
 *  - Persistencia: una vez votado, queda fijo (no se puede re-votar desde
 *    el mismo browser para el mismo target).
 */

import { useState } from 'react';
import { Star, Check } from 'lucide-react';
import {
  emitSignal,
  hasEmittedExplicit,
  type EmitSignalInput,
} from '@/lib/feedback';
import { useHydrated } from '@/hooks/use-hydrated';

interface Props extends Omit<EmitSignalInput, 'rating' | 'binary' | 'kind'> {
  label?: string;
  /** Max stars, default 5. */
  max?: number;
  thanksText?: string;
}

export function FeedbackRating({
  label = '¿Cómo calificás esto?',
  max = 5,
  thanksText = 'Gracias por la calificación.',
  ...input
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useHydrated();

  // Ya votó antes (lectura client-only de localStorage, diferida hasta hidratar
  // para no romper SSR) O acaba de votar en esta sesión.
  const done =
    submitted !== null ||
    (hydrated && hasEmittedExplicit(input.touchpoint, input.targetId));

  const submit = async (value: number) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitted(value);
    void emitSignal({ ...input, rating: value, kind: 'explicit' });
    setSubmitting(false);
  };

  if (done) {
    return (
      <div
        className="inline-flex items-center gap-1.5 text-xs text-slate-500"
        data-feedback="rating-done"
      >
        <Check size={13} className="text-emerald-600" />
        <span>{thanksText}</span>
      </div>
    );
  }

  const displayValue = hover ?? 0;

  return (
    <div className="flex flex-col gap-2" data-feedback="rating">
      {label && (
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          {label}
        </span>
      )}
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {Array.from({ length: max }).map((_, i) => {
          const value = i + 1;
          const filled = value <= displayValue;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={false}
              aria-label={`${value} de ${max}`}
              disabled={submitting}
              onMouseEnter={() => setHover(value)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(value)}
              onBlur={() => setHover(null)}
              onClick={() => submit(value)}
              className="p-0.5 transition disabled:opacity-50 hover:scale-110"
            >
              <Star
                size={20}
                className={
                  filled
                    ? 'text-amber-500 fill-amber-500 transition-colors'
                    : 'text-slate-300 fill-transparent transition-colors'
                }
              />
            </button>
          );
        })}
        {hover && (
          <span className="ml-2 text-xs text-slate-500 tabular-nums">
            {hover} / {max}
          </span>
        )}
      </div>
    </div>
  );
}
