/**
 * Helper cliente para emitir señales de feedback al endpoint /api/feedback.
 *
 * Diseño:
 *  - `keepalive: true` para que la fetch sobreviva navegación de página
 *    (importante para señales implícitas tipo "click → cambio de URL").
 *  - Idempotencia local por (touchpoint, targetId) via localStorage:
 *    si el user ya emitió una explícita para el mismo target+touchpoint,
 *    no la mostramos otra vez. Las señales implícitas no se dedupen
 *    (cada click cuenta).
 *  - Fire-and-forget: ni la UI ni el flow del user esperan al server.
 *
 * Uso típico desde un componente:
 *
 *   import { emitSignal } from '@/lib/feedback';
 *   await emitSignal({
 *     touchpoint: 'profile_accuracy',
 *     targetType: 'profile',
 *     targetId: profileId,
 *     binary: true,
 *     userId: user.uid,
 *     userRole: account.role,
 *   });
 */
import type {
  FeedbackTarget,
  FeedbackTouchpoint,
  SignalKind,
} from "./types";

export interface EmitSignalInput {
  touchpoint: FeedbackTouchpoint;
  targetType: FeedbackTarget;
  targetId: string;
  kind?: SignalKind; // default "explicit"
  rating?: number;
  binary?: boolean;
  text?: string;
  userId?: string;
  userRole?: "joven" | "empresa";
  needId?: string;
  profileId?: string;
  icsAtTime?: number;
  modelVersion?: string;
  note?: string;
}

function lsKey(touchpoint: FeedbackTouchpoint, targetId: string): string {
  return `salto.feedback.${touchpoint}.${targetId}`;
}

/**
 * ¿Ya emití una señal EXPLÍCITA para este (touchpoint, targetId)?
 * Útil para que el prompt no aparezca dos veces al mismo user.
 */
export function hasEmittedExplicit(touchpoint: FeedbackTouchpoint, targetId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(lsKey(touchpoint, targetId)) !== null;
  } catch {
    return false;
  }
}

function markEmitted(touchpoint: FeedbackTouchpoint, targetId: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(touchpoint, targetId), value);
  } catch {
    /* quota — ignoramos */
  }
}

/**
 * Emite una señal al server. No throwea: si la red falla, devuelve false.
 * Para señales implícitas, NO bloquea la UI — usa `keepalive`.
 */
export async function emitSignal(input: EmitSignalInput): Promise<boolean> {
  const kind: SignalKind = input.kind ?? "explicit";

  // Dedup explícito: si ya votó por esto, no lo mandamos de nuevo. Las
  // señales implícitas (clicks) no se dedupean — cada una es información.
  if (kind === "explicit" && hasEmittedExplicit(input.touchpoint, input.targetId)) {
    return true;
  }

  const payload = { ...input, kind };

  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (res.ok && kind === "explicit") {
      const stamp = JSON.stringify({
        rating: input.rating,
        binary: input.binary,
        text: input.text,
        at: Date.now(),
      });
      markEmitted(input.touchpoint, input.targetId, stamp);
    }
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Batch: emite múltiples señales en una sola llamada. Útil cuando una
 * pantalla pregunta 2-3 cosas al usuario al mismo tiempo (ej. post-entrevista).
 */
export async function emitSignalBatch(inputs: EmitSignalInput[]): Promise<boolean> {
  if (inputs.length === 0) return true;
  const payload = inputs.map((i) => ({ ...i, kind: i.kind ?? "explicit" }));
  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (res.ok) {
      for (const inp of inputs) {
        if ((inp.kind ?? "explicit") === "explicit") {
          markEmitted(inp.touchpoint, inp.targetId, JSON.stringify({ at: Date.now() }));
        }
      }
    }
    return res.ok;
  } catch {
    return false;
  }
}
