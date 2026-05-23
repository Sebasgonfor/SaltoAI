'use client';

/**
 * Botón de feedback ¿útil? sí/no en cada match (PRD §6.2.6, §8.6).
 *
 * UX deliberadamente mínima: dos botones, optimista, sin diálogo modal —
 * cuanto menos fricción, más datos limpios entran al flywheel.
 * Persistimos en `localStorage` también para que la UI sobreviva refresh
 * sin reconsultar Firestore.
 */
import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check } from 'lucide-react';

type Vote = 'useful' | 'not_useful' | null;

function lsKey(matchId: string) {
  return `salto.feedback.${matchId}`;
}

function readVote(matchId: string): Vote {
  if (typeof window === 'undefined') return null;
  try {
    return (window.localStorage.getItem(lsKey(matchId)) as Vote) ?? null;
  } catch {
    return null;
  }
}

interface Props {
  needId: string;
  profileId: string;
  variant?: 'hero' | 'card';
}

export default function MatchFeedback({ needId, profileId, variant = 'card' }: Props) {
  const matchId = `${needId}__${profileId}`;
  const [vote, setVote] = useState<Vote>(() => readVote(matchId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (useful: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const next: Vote = useful ? 'useful' : 'not_useful';
    // Optimista: marcamos antes de que vuelva el server.
    setVote(next);
    try {
      window.localStorage.setItem(lsKey(matchId), next);
    } catch {
      /* ignore quota errors */
    }
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          needId,
          profileId,
          useful,
          source: 'empresa_match',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'No pudimos guardar tu feedback.');
      }
    } catch (e) {
      setVote(null);
      try {
        window.localStorage.removeItem(lsKey(matchId));
      } catch {
        /* ignore */
      }
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (vote) {
    const label = vote === 'useful' ? '¡Gracias! Lo marcaste útil.' : 'Gracias — esto reentrena el motor.';
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-xs ${
          variant === 'hero' ? 'text-emerald-700' : 'text-slate-600'
        }`}
        data-testid="match-feedback-thanks"
      >
        <Check size={14} className="text-emerald-600" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" data-testid={`match-feedback-${matchId}`}>
      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mr-1">
        ¿Útil?
      </span>
      <button
        type="button"
        disabled={submitting}
        onClick={() => submit(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs hover:bg-emerald-100 transition disabled:opacity-50"
        aria-label="Marcar este match como útil"
      >
        <ThumbsUp size={12} /> Sí
      </button>
      <button
        type="button"
        disabled={submitting}
        onClick={() => submit(false)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-700 text-xs hover:bg-slate-50 transition disabled:opacity-50"
        aria-label="Marcar este match como NO útil"
      >
        <ThumbsDown size={12} /> No
      </button>
      {error && <span className="text-[11px] text-rose-600 ml-1">{error}</span>}
    </div>
  );
}
