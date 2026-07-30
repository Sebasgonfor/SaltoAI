'use client';

/**
 * Feedback DIRECTO de la empresa al joven (PRD §8.6 v4 — bidireccional).
 *
 * Exporta dos primitives que aparecen en `/joven/perfil/[id]` cuando el
 * viewer es `empresa`:
 *
 *   <CompanyFeedbackToYouth>  — Form de comentario + rating sobre la
 *                                candidatura. Visible al joven.
 *   <PassReasonButton>        — Botón "No avanzar" con razón opcional.
 *                                Cierra el loop que ningún competidor da.
 *
 * UX:
 *  - Optimista: el form se contrae a "Enviado" inmediatamente.
 *  - Persistente: una vez enviado por (empresa, joven), no se puede re-enviar.
 *    El dedup vive en localStorage como con los otros prompts.
 *  - Privacidad: el founder firma con el `authorDisplayName` (su empresa).
 *    No hay modo anónimo en este MVP — el joven necesita saber quién dijo qué.
 */

import { useEffect, useState } from 'react';
import { Star, Check, MessageCircle, X, AlertTriangle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth-context';
import { emitSignal, hasEmittedExplicit } from '@/lib/feedback';

// ─── CompanyFeedbackToYouth ──────────────────────────────────────────────────

interface CompanyFeedbackProps {
  /** ProfileId del joven (target del feedback). */
  profileId: string;
  /** Si el founder llegó desde un match específico, lo guardamos para contexto. */
  needId?: string;
  /** ICS estimado al momento del feedback — para calibrar el motor a posteriori. */
  icsAtTime?: number;
  /** Nombre del joven, para mostrar en el header del form. */
  profileName?: string;
}

export function CompanyFeedbackToYouth({
  profileId,
  needId,
  icsAtTime,
  profileName,
}: CompanyFeedbackProps) {
  const { user, account } = useAuth();
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dedup alineado con lo que `emitSignal` marca server-side: el targetId
  // que va al server ES `profileId` (sin sufijo). localStorage ya es
  // por-browser, así que founders distintos en browsers distintos no
  // se bloquean entre sí. Y dentro del mismo browser/founder, queremos
  // exactamente UN feedback por relación founder→joven.
  useEffect(() => {
    if (hasEmittedExplicit('company_feedback_to_youth', profileId)) {
      setSubmitted(true);
    }
  }, [profileId]);

  // Si el viewer no es empresa, no renderizamos nada. Defensa en profundidad:
  // el caller ya gatea por viewerIsEmpresa, pero un día puede equivocarse.
  if (account?.role !== 'empresa') return null;

  const submit = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    const ok = await emitSignal({
      touchpoint: 'company_feedback_to_youth',
      kind: 'explicit',
      targetType: 'profile',
      targetId: profileId,
      userId: user?.uid,
      userRole: 'empresa',
      rating: rating as 1 | 2 | 3 | 4 | 5,
      text: comment.trim() || undefined,
      needId,
      profileId,
      icsAtTime,
      authorDisplayName:
        user?.displayName || user?.email?.split('@')[0] || 'Una empresa',
    });
    if (ok) {
      // emitSignal ya marcó (company_feedback_to_youth, profileId) en
      // localStorage — no necesitamos un markEmitted extra.
      setSubmitted(true);
    } else {
      setError('No pudimos enviar tu feedback. Reintenta en un momento.');
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div
        className="bg-emerald-50/60 border border-emerald-200/60 rounded-2xl px-5 py-4 flex items-start gap-3"
        data-feedback="company-to-youth-done"
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <Check size={14} />
        </div>
        <div className="text-sm leading-snug">
          <div className="font-semibold text-slate-900">
            Feedback enviado{profileName ? ` a ${profileName.split(' ')[0]}` : ''}.
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            Lo recibe en su inbox. Es feedback honesto que raramente recibe en otros lados.
          </div>
        </div>
      </div>
    );
  }

  const displayRating = hover || rating;

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl p-5"
      data-feedback="company-to-youth"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <MessageCircle size={16} />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">
            Dejá feedback{profileName ? ` a ${profileName.split(' ')[0]}` : ' al candidato'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
            Un comentario corto sobre su candidatura. Lo va a ver en su perfil —
            y va a poder responderte.
          </p>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          ¿Qué tan bien encaja?
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {Array.from({ length: 5 }).map((_, i) => {
            const value = i + 1;
            const filled = value <= displayRating;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} de 5`}
                disabled={submitting}
                onMouseEnter={() => setHover(value)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(value)}
                className="p-1 transition disabled:opacity-50 hover:scale-110"
              >
                <Star
                  size={22}
                  className={
                    filled
                      ? 'text-amber-500 fill-amber-500 transition-colors'
                      : 'text-slate-300 fill-transparent transition-colors'
                  }
                />
              </button>
            );
          })}
          {rating > 0 && (
            <span className="ml-2 text-xs text-slate-500 tabular-nums">
              {rating} / 5
            </span>
          )}
        </div>
      </div>

      <div className="mb-3">
        <label
          htmlFor="company-feedback-comment"
          className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1.5"
        >
          Comentario <span className="text-slate-400 normal-case font-normal">(opcional, recomendado)</span>
        </label>
        <Textarea
          id="company-feedback-comment"
          placeholder="Lo que te gustó, lo que le falta, si lo vas a contactar. Esto es feedback real."
          className="min-h-20 text-sm leading-relaxed"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={submitting}
          maxLength={500}
        />
      </div>

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        onClick={submit}
        disabled={rating === 0 || submitting}
        size="sm"
        className="gap-2"
      >
        <Send size={13} />
        {submitting ? 'Enviando…' : 'Enviar feedback'}
      </Button>
    </div>
  );
}

// ─── PassReasonButton ────────────────────────────────────────────────────────

const PASS_REASONS: Array<{
  code: 'skill_gap' | 'context_mismatch' | 'availability' | 'salary_range' | 'other';
  label: string;
}> = [
  { code: 'skill_gap', label: 'Le falta una skill clave' },
  { code: 'context_mismatch', label: 'No encaja con el contexto del rol' },
  { code: 'availability', label: 'Disponibilidad/horarios incompatibles' },
  { code: 'salary_range', label: 'Rango salarial no encaja' },
  { code: 'other', label: 'Otra razón' },
];

interface PassReasonProps {
  profileId: string;
  needId?: string;
  icsAtTime?: number;
  profileName?: string;
}

export function PassReasonButton({
  profileId,
  needId,
  icsAtTime,
  profileName,
}: PassReasonProps) {
  const { user, account } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reasonCode, setReasonCode] = useState<typeof PASS_REASONS[number]['code'] | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mismo razonamiento que CompanyFeedbackToYouth: dedup alineado con el
  // targetId que va al server (profileId), localStorage por-browser.
  useEffect(() => {
    if (hasEmittedExplicit('company_pass_reason', profileId)) {
      setSubmitted(true);
    }
  }, [profileId]);

  if (account?.role !== 'empresa') return null;

  const submit = async () => {
    if (!reasonCode || submitting) return;
    setSubmitting(true);
    setError(null);
    const reasonLabel = PASS_REASONS.find((r) => r.code === reasonCode)?.label ?? reasonCode;
    const composedText = text.trim()
      ? `${reasonLabel}: ${text.trim()}`
      : reasonLabel;
    const ok = await emitSignal({
      touchpoint: 'company_pass_reason',
      kind: 'explicit',
      targetType: 'profile',
      targetId: profileId,
      userId: user?.uid,
      userRole: 'empresa',
      binary: false, // = "no avanzo"
      text: composedText,
      reasonCode,
      needId,
      profileId,
      icsAtTime,
      authorDisplayName:
        user?.displayName || user?.email?.split('@')[0] || 'Una empresa',
    });
    if (ok) {
      // emitSignal ya marcó (company_pass_reason, profileId).
      setSubmitted(true);
      setOpen(false);
    } else {
      setError('No pudimos guardar tu razón. Reintenta.');
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="text-xs text-slate-500 inline-flex items-center gap-1.5">
        <Check size={12} className="text-emerald-600" />
        <span>Razón enviada{profileName ? ` a ${profileName.split(' ')[0]}` : ''}.</span>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-slate-500 hover:text-slate-900"
      >
        <X size={12} /> No avanzar · dejar razón
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Razón para no avanzar"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-lg text-slate-900">
                  ¿Por qué no avanzás?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  El joven{profileName ? ` (${profileName.split(' ')[0]})` : ''} va a recibir tu razón.
                  Es feedback que raramente le dan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {PASS_REASONS.map((r) => (
                <label
                  key={r.code}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    reasonCode === r.code
                      ? 'border-emerald-300 bg-emerald-50/50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="pass-reason"
                    value={r.code}
                    checked={reasonCode === r.code}
                    onChange={() => setReasonCode(r.code)}
                    className="accent-emerald-600"
                  />
                  <span className="text-sm text-slate-800">{r.label}</span>
                </label>
              ))}
            </div>

            <Textarea
              placeholder="Comentario corto (opcional). Sé honesto: el joven aprende de esto."
              className="min-h-20 text-sm mb-3"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={submitting}
              maxLength={300}
            />

            {error && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={!reasonCode || submitting}
              >
                {submitting ? 'Enviando…' : 'Enviar razón'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
