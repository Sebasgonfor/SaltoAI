'use client';

/**
 * Inbox del joven — feedbacks recibidos de empresas (PRD §8.6 v4).
 *
 * Lee de `/api/feedback/youth?profileId=X` y arma threads:
 *   - parent: `company_feedback_to_youth` o `company_pass_reason`
 *   - replies: `youth_reply_to_company` con `parentFeedbackId`
 *
 * Layout:
 *   - Card por thread, ordenadas por timestamp desc (lo más reciente arriba).
 *   - Pass reasons se distinguen visualmente (gris + ícono X) vs feedback
 *     positivo (verde + estrella).
 *   - El joven puede responder con un textarea inline (max 280 chars, tipo
 *     respuesta corta — no es un thread de email).
 *   - Si no hay feedbacks aún, mostramos un empty state explicativo (no
 *     una pantalla vacía rota).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Star,
  MessageCircle,
  X as XIcon,
  Send,
  Inbox,
  Reply,
  Check,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth-context';
import { emitSignal } from '@/lib/feedback';
import type { FeedbackEntry } from '@/lib/types';

interface Thread {
  feedback: FeedbackEntry;
  replies: FeedbackEntry[];
}

interface InboxResponse {
  profileId: string;
  threads: Thread[];
  summary: {
    total: number;
    withReplies: number;
    passReasons: number;
    positives: number;
  };
}

function formatAgo(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.round(hr / 24);
  return `hace ${d} d`;
}

export function YouthFeedbackInbox({ profileId }: { profileId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Refresh manual: estado separado para que el spinner del botón sea
  // visible pero NO se desmonte la lista actual. UX: dejar de feedback
  // y ver el botón girar 800ms en vez de que parpadee el inbox.
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInbox = useCallback(async () => {
    try {
      // Pasamos también el user.uid del joven autenticado para cubrir el
      // caso donde la empresa dejó feedback contra un id distinto al del
      // URL (ej. perfiles del seed con id=seed_xxx vs el uid real). El
      // endpoint hace OR sobre los dos targetIds para encontrar todo.
      const params = new URLSearchParams({ profileId });
      if (user?.uid && user.uid !== profileId) {
        params.set('uid', user.uid);
      }
      const res = await fetch(`/api/feedback/youth?${params.toString()}`);
      if (!res.ok) {
        setError('No pudimos cargar tu inbox.');
        return;
      }
      const json = (await res.json()) as InboxResponse;
      setData(json);
      setLastFetchAt(Date.now());
      setError(null);
    } catch {
      setError('Error de red.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // user?.uid en deps para re-fetch si la sesión cambia (logout+login con
    // distinta cuenta abre nuevos aliases de targetId).
  }, [profileId, user?.uid]);

  // Handler dedicado para refresh manual: marca refreshing=true (visible
  // en el botón) sin tocar loading=true que desmontaría el render actual.
  const handleManualRefresh = () => {
    if (refreshing || loading) return;
    setRefreshing(true);
    void fetchInbox();
  };

  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8">
        <div className="h-5 w-1/3 bg-slate-200 rounded mb-3 animate-pulse" />
        <div className="h-4 w-2/3 bg-slate-100 rounded animate-pulse" />
      </section>
    );
  }

  if (error || !data) return null;

  const isEmpty = data.threads.length === 0;

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8">
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
            Tu inbox
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-slate-900 tracking-tight leading-tight">
            Feedback de empresas que te vieron.
          </h2>
          <p className="text-sm text-slate-600 mt-2 max-w-xl leading-relaxed">
            Esto es lo que LinkedIn nunca te da: comentarios reales de empresas que
            abrieron tu perfil — incluso cuando no avanzaron. Podés responder.
          </p>
          {lastFetchAt && (
            <p className="text-[11px] text-slate-400 mt-2">
              Actualizado {formatAgo(lastFetchAt)}.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {/* Botón refrescar — necesario porque cuando una empresa deja
              feedback estando vos en otra pestaña, no hay push notification
              ni websocket: la única forma de verlo era refresh del browser.
              Esto re-fetch sin recargar la página. */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-emerald-700 disabled:opacity-50 border border-slate-200 hover:border-emerald-300 rounded-full px-3 py-1.5 transition-colors"
            title="Buscar feedback nuevo"
          >
            <RefreshCw
              size={12}
              className={refreshing ? 'animate-spin' : ''}
            />
            {refreshing ? 'Buscando…' : 'Refrescar'}
          </button>
          {!isEmpty && (
            <div className="text-xs text-slate-500 hidden sm:flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Star size={11} className="text-amber-500" /> {data.summary.positives} positivos
              </span>
              <span className="inline-flex items-center gap-1">
                <XIcon size={11} className="text-slate-400" /> {data.summary.passReasons} descartes
              </span>
            </div>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
          <Inbox size={28} className="text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Cuando una empresa abra tu perfil, vas a ver acá su feedback —
            sea bueno, sea regular o sea un &ldquo;no avanzo porque…&rdquo;.
            Es data accionable para crecer.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.threads.map((t) => (
            <ThreadCard
              key={t.feedback.id ?? t.feedback.timestamp}
              thread={t}
              profileId={profileId}
              youthUid={user?.uid}
              onReplyPosted={fetchInbox}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── ThreadCard ──────────────────────────────────────────────────────────────

interface ThreadCardProps {
  thread: Thread;
  profileId: string;
  youthUid?: string;
  onReplyPosted: () => void;
}

function ThreadCard({ thread, profileId, youthUid, onReplyPosted }: ThreadCardProps) {
  const { feedback, replies } = thread;
  const isPassReason = feedback.touchpoint === 'company_pass_reason';
  const hasReplied = replies.some((r) => r.userId === youthUid);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const author = feedback.authorDisplayName || 'Una empresa';
  const ago = formatAgo(feedback.timestamp);

  const submitReply = async () => {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    // targetId único POR PARENT para que el dedup del localStorage no
    // bloquee el segundo reply del joven. Si usáramos solo `profileId`,
    // emitSignal vería la key ya marcada y cortaría el segundo reply
    // silencioso. El endpoint /api/feedback/youth filtra replies por
    // `parentFeedbackId`, no por `targetId`, así que esta clave compuesta
    // no rompe el anidado del inbox.
    const replyTargetId = feedback.id
      ? `${profileId}__reply_to_${feedback.id}`
      : `${profileId}__reply_${feedback.timestamp ?? Date.now()}`;
    const ok = await emitSignal({
      touchpoint: 'youth_reply_to_company',
      kind: 'explicit',
      targetType: 'profile',
      targetId: replyTargetId,
      userId: youthUid,
      userRole: 'joven',
      text: replyText.trim(),
      parentFeedbackId: feedback.id,
    });
    if (ok) {
      setReplyText('');
      setReplyOpen(false);
      onReplyPosted();
    }
    setSubmitting(false);
  };

  const headerBg = isPassReason
    ? 'bg-slate-50 border-slate-200'
    : 'bg-emerald-50/40 border-emerald-200/60';

  const iconCircle = isPassReason
    ? 'bg-slate-200 text-slate-600'
    : 'bg-emerald-100 text-emerald-700';

  return (
    <article className={`border rounded-2xl overflow-hidden ${headerBg}`}>
      <header className="px-5 py-4 flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconCircle}`}>
          {isPassReason ? <XIcon size={15} /> : <MessageCircle size={15} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-sm">{author}</span>
            {isPassReason ? (
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                No avanzó
              </span>
            ) : (
              feedback.rating && feedback.rating > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={11}
                      className={
                        i < (feedback.rating ?? 0)
                          ? 'text-amber-500 fill-amber-500'
                          : 'text-slate-200 fill-transparent'
                      }
                    />
                  ))}
                </span>
              )
            )}
            <span className="text-[11px] text-slate-400">· {ago}</span>
          </div>
          {feedback.text && (
            <p className="mt-2 text-sm text-slate-800 leading-relaxed">
              {feedback.text}
            </p>
          )}
        </div>
      </header>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="bg-white/80 backdrop-blur px-5 py-3 border-t border-slate-200/70 space-y-2">
          {replies.map((r) => (
            <div
              key={r.id ?? r.timestamp}
              className="flex items-start gap-2.5 pl-9"
            >
              <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold">
                Vos
              </div>
              <div className="flex-1">
                <div className="text-[11px] text-slate-400 mb-0.5">
                  {formatAgo(r.timestamp)}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{r.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply form / button */}
      <footer className="bg-white px-5 py-3 border-t border-slate-200/70">
        {hasReplied ? (
          <div className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <Check size={11} className="text-emerald-600" />
            Ya respondiste a este feedback.
          </div>
        ) : replyOpen ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Respuesta corta (gracias, una pregunta, una actualización)…"
              className="min-h-16 text-sm"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              maxLength={280}
              disabled={submitting}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReplyOpen(false);
                  setReplyText('');
                }}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={submitReply}
                disabled={!replyText.trim() || submitting}
                className="gap-1.5"
              >
                <Send size={11} />
                {submitting ? 'Enviando…' : 'Responder'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplyOpen(true)}
            className="gap-1.5 text-slate-500 hover:text-slate-900 -ml-2"
          >
            <Reply size={12} /> Responder
          </Button>
        )}
      </footer>
    </article>
  );
}
