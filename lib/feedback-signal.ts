/**
 * Agregación de señales de feedback → delta de calibración para el ICS.
 *
 * El objetivo de este módulo es **traducir el feedback acumulado en una
 * corrección del score predicho** por el LLM/heurística. Es el primer eslabón
 * del data flywheel: sin contrataciones reales todavía, usamos las acciones
 * del founder (clicks, microtasks, ratings) como proxies de ground-truth.
 *
 * Reglas de peso (calibradas a mano para el MVP — se ajustan con datos reales):
 *
 *   Señal                              Si es positiva   Si es negativa
 *   ──────────────────────────────────────────────────────────────────
 *   explicit_vote (👍/👎)              +5               −10
 *   implicit_connect (click "conectar") +3              (no aplica)
 *   implicit_microtask (propuso tarea)  +5              (no aplica)
 *   microtask_outcome (rating 1-5)     ver mapeo abajo
 *
 * Cap absoluto: ±15 puntos. Esto evita que un solo vote rompa el ranking;
 * el LLM sigue siendo la señal principal.
 *
 * Múltiples señales del mismo tipo NO se suman entre sí (se usa la más
 * reciente). Señales de tipos distintos SÍ se suman, hasta el cap.
 */
import type { FeedbackEntry } from "./types";
import { listFeedback } from "./db";

export const FEEDBACK_DELTA_CAP = 15;

interface MatchFeedbackAggregate {
  delta: number;
  reasons: string[];
  /** Feedbacks que contribuyeron, para auditoría. */
  contributing: FeedbackEntry[];
}

/**
 * Mapea un rating de microtask (1-5) a delta ICS.
 *   5 → +10 (excelente outcome)
 *   4 → +5
 *   3 → 0   (neutro)
 *   2 → -10
 *   1 → -15
 */
function outcomeRatingToDelta(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score >= 5) return 10;
  if (score >= 4) return 5;
  if (score >= 3) return 0;
  if (score >= 2) return -10;
  return -15;
}

/**
 * Devuelve el delta acumulado para un par (needId, profileId) consultando
 * `listFeedback()` en memoria/Firestore. Acepta un set ya cargado de feedbacks
 * para evitar hacer N queries cuando se está scoreando un batch.
 */
export function aggregateFeedbackForMatch(
  needId: string,
  profileId: string,
  allFeedback: FeedbackEntry[]
): MatchFeedbackAggregate {
  const matchId = `${needId}__${profileId}`;
  const entries = allFeedback
    .filter((f) => f.matchId === matchId)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (entries.length === 0) {
    return { delta: 0, reasons: [], contributing: [] };
  }

  let delta = 0;
  const reasons: string[] = [];
  const contributing: FeedbackEntry[] = [];
  // Para cada signalType usamos solo la entrada MÁS RECIENTE. Esto evita
  // que un founder oscile (votó 👍, después 👎, después 👍) y el sistema
  // double-count. Lo último que dijo es lo que cuenta.
  const seen = new Set<string>();
  for (const f of entries) {
    const type = f.signalType ?? "explicit_vote";
    if (seen.has(type)) continue;
    seen.add(type);
    contributing.push(f);

    switch (type) {
      case "explicit_vote":
        if (f.useful) {
          delta += 5;
          reasons.push("👍 explícito del founder");
        } else {
          delta -= 10;
          reasons.push("👎 explícito del founder");
        }
        break;
      case "implicit_connect":
        if (f.useful) {
          delta += 3;
          reasons.push("founder clickeó 'Quiero conectar'");
        }
        break;
      case "implicit_microtask":
        if (f.useful) {
          delta += 5;
          reasons.push("founder propuso una micro-tarea pagada");
        }
        break;
      case "microtask_outcome": {
        const d = outcomeRatingToDelta(f.score ?? 0);
        if (d !== 0) {
          delta += d;
          reasons.push(`micro-tarea rateada ${f.score}/5`);
        }
        break;
      }
    }
  }

  // Cap absoluto
  if (delta > FEEDBACK_DELTA_CAP) delta = FEEDBACK_DELTA_CAP;
  if (delta < -FEEDBACK_DELTA_CAP) delta = -FEEDBACK_DELTA_CAP;

  return { delta, reasons, contributing };
}

/**
 * Carga todos los feedbacks una sola vez y devuelve una función para querear
 * por match. Optimización para cuando estamos scoreando un batch grande de
 * candidatos contra una sola necesidad (o viceversa).
 */
export async function loadFeedbackIndex(): Promise<
  (needId: string, profileId: string) => MatchFeedbackAggregate
> {
  const all = await listFeedback();
  return (needId: string, profileId: string) =>
    aggregateFeedbackForMatch(needId, profileId, all);
}
