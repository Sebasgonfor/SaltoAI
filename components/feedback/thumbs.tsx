'use client';

/**
 * Primitive de feedback rápido sí/no (👍/👎). Lo usamos en los touchpoints
 * que se pueden contestar con un binary sin contexto extra (ej. "este match
 * fue útil?", "el red flag fue acertado?", "el rol sugerido te interesa?").
 *
 * Estado:
 *   - Pre-vote: muestra label + dos botones.
 *   - Post-vote: muestra confirmación.
 *   - Persistencia: si el user ya votó por este (touchpoint, targetId), se
 *     queda en estado post-vote on mount.
 *
 * Optimista: marca el state antes de que vuelva el server. Si la red falla,
 * mantenemos el state local — no le mostramos al user un error porque su
 * voto sigue siendo válido y se reintenta en el próximo localStorage flush.
 */

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import {
  emitSignal,
  hasEmittedExplicit,
  type EmitSignalInput,
} from '@/lib/feedback';
import { useHydrated } from '@/hooks/use-hydrated';

interface Props extends Omit<EmitSignalInput, 'binary' | 'rating' | 'text' | 'kind'> {
  /** Texto antes del voto. Default: "¿Te sirvió?" */
  label?: string;
  /** Texto post-vote positivo. Default: "Gracias, lo registramos." */
  thanksText?: string;
  /** Layout — inline (default) o stacked vertical. */
  layout?: 'inline' | 'stacked';
  /** Si true, no muestra confirmación post-vote (silencioso). */
  silent?: boolean;
}

export function FeedbackThumbs({
  label = '¿Te sirvió?',
  thanksText = 'Gracias por el feedback.',
  layout = 'inline',
  silent = false,
  ...input
}: Props) {
  const [vote, setVote] = useState<'yes' | 'no' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useHydrated();

  // Ya votó antes (localStorage, diferido hasta hidratar) o acaba de votar.
  const done =
    vote !== null ||
    (hydrated && hasEmittedExplicit(input.touchpoint, input.targetId));

  const submit = async (yes: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setVote(yes ? 'yes' : 'no');
    void emitSignal({ ...input, binary: yes, kind: 'explicit' });
    setSubmitting(false);
  };

  if (done) {
    if (silent) return null;
    return (
      <div
        className="inline-flex items-center gap-1.5 text-xs text-slate-500"
        data-feedback="thumbs-done"
      >
        <Check size={13} className="text-emerald-600" />
        <span>{thanksText}</span>
      </div>
    );
  }

  const container = layout === 'inline' ? 'flex items-center gap-2' : 'flex flex-col gap-2';

  return (
    <div className={container} data-feedback="thumbs">
      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs hover:bg-emerald-100 transition disabled:opacity-50"
          aria-label={`${label}: sí`}
        >
          <ThumbsUp size={12} /> Sí
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(false)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-700 text-xs hover:bg-slate-50 transition disabled:opacity-50"
          aria-label={`${label}: no`}
        >
          <ThumbsDown size={12} /> No
        </button>
      </div>
    </div>
  );
}
