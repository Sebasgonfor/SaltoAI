import { NextRequest, NextResponse } from "next/server";
import { listFeedback } from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { FeedbackEntry, FeedbackTouchpoint, SignalKind } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Agregaciones del data flywheel (PRD §6.2.6 + §8.6).
 *
 * Cuenta señales por touchpoint, separadas por kind (explicit/implicit), con:
 *  - count: total de señales
 *  - positiveRate: % de "sí" para binary, o avg rating para rating (escala 0-100
 *    para que sea comparable entre touchpoints distintos)
 *  - lastTimestamp: cuán reciente es la última señal — útil para detectar
 *    touchpoints que dejaron de capturar (instrumentación rota o feature muerta).
 *
 * También devuelve:
 *  - correlation entre ICS al momento del match y outcome real de microtask
 *    (rating del founder). Eso es §8.6: el motor de calibración del modelo.
 *  - últimos 20 eventos (sin PII) para sanity check en demo.
 *
 * Endpoint PÚBLICO — solo agregados, no IDs de user. Se consume desde
 * `/aliados/impacto` para mostrar el flywheel vivo en el pitch.
 */

interface TouchpointSummary {
  touchpoint: FeedbackTouchpoint | "legacy";
  total: number;
  explicit: number;
  implicit: number;
  positiveRate: number | null; // 0-100 o null si no aplica (señal implícita sin payload)
  lastTimestamp: number | null;
  // Cuántos vienen con icsAtTime — útiles para calibración.
  withIcsCount: number;
}

function inferTouchpoint(e: FeedbackEntry): FeedbackTouchpoint | "legacy" {
  if (e.touchpoint) return e.touchpoint;
  // Mapeo de señales legacy al touchpoint v3 más cercano. Si vino del
  // botón "útil sí/no" del primer MVP, es match_useful.
  if (e.signalType === "explicit_vote") return "match_useful";
  if (e.signalType === "implicit_connect") return "profile_click";
  if (e.signalType === "implicit_microtask") return "microtask_proposed";
  if (e.signalType === "microtask_outcome") return "microtask_outcome";
  return "legacy";
}

function inferKind(e: FeedbackEntry): SignalKind {
  if (e.kind) return e.kind;
  // Heurística legacy.
  if (e.signalType === "implicit_connect" || e.signalType === "implicit_microtask") {
    return "implicit";
  }
  return "explicit";
}

/**
 * Computa "positiveRate" sobre todas las señales del touchpoint:
 *  - Si el touchpoint tiene `rating` (1-5), promedia rating/5 × 100.
 *  - Si tiene `binary`, % de true.
 *  - Si tiene `useful` (legacy), % de true.
 *  - Si solo tiene clicks implícitos sin payload, devolvemos null
 *    (no hay manera de saber si "fue positivo").
 */
function computePositiveRate(entries: FeedbackEntry[]): number | null {
  const ratings = entries
    .map((e) => (typeof e.rating === "number" ? e.rating : null))
    .filter((x): x is number => x !== null);
  if (ratings.length > 0) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    return Math.round((avg / 5) * 100);
  }
  const binaries: boolean[] = [];
  for (const e of entries) {
    if (typeof e.binary === "boolean") binaries.push(e.binary);
    else if (typeof e.useful === "boolean") binaries.push(e.useful);
  }
  if (binaries.length === 0) return null;
  const positives = binaries.filter(Boolean).length;
  return Math.round((positives / binaries.length) * 100);
}

/** Pearson básico para correlación ICS ↔ outcome. */
function pearson(pairs: Array<[number, number]>): number {
  if (pairs.length < 2) return 0;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return Math.round((num / Math.sqrt(denX * denY)) * 100) / 100;
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "admin.flywheel");

  const all = await listFeedback();
  const total = all.length;

  // Agrupamos por touchpoint inferido (v3 nativo o legacy mapeado).
  const byTouchpoint = new Map<FeedbackTouchpoint | "legacy", FeedbackEntry[]>();
  for (const e of all) {
    const tp = inferTouchpoint(e);
    const bucket = byTouchpoint.get(tp) ?? [];
    bucket.push(e);
    byTouchpoint.set(tp, bucket);
  }

  const touchpoints: TouchpointSummary[] = [];
  for (const [tp, entries] of byTouchpoint.entries()) {
    const explicit = entries.filter((e) => inferKind(e) === "explicit").length;
    const implicit = entries.length - explicit;
    const lastTimestamp = entries.reduce((m, e) => Math.max(m, e.timestamp ?? 0), 0);
    const withIcsCount = entries.filter((e) => typeof e.icsAtTime === "number").length;
    touchpoints.push({
      touchpoint: tp,
      total: entries.length,
      explicit,
      implicit,
      positiveRate: computePositiveRate(entries),
      lastTimestamp: lastTimestamp || null,
      withIcsCount,
    });
  }
  // Orden estable: por total desc para que el dashboard muestre los más
  // ruidosos arriba.
  touchpoints.sort((a, b) => b.total - a.total);

  // Calibración ICS ↔ outcome — el centro del flywheel.
  // Pareamos cada outcome de microtask (rating del founder) con el ICS
  // al momento del match. La relación esperada es positiva: ICS alto →
  // outcome alto (founders rate 4-5). Anti-correlación = motor roto.
  const outcomePairs: Array<[number, number]> = [];
  for (const e of all) {
    if (
      (e.touchpoint === "microtask_outcome" || e.signalType === "microtask_outcome") &&
      typeof e.icsAtTime === "number"
    ) {
      const value =
        typeof e.rating === "number"
          ? e.rating
          : typeof e.score === "number"
            ? e.score
            : null;
      if (value !== null) outcomePairs.push([e.icsAtTime, value]);
    }
  }
  const outcomeCorrelation = pearson(outcomePairs);

  // Pre-eval agreement: cuántas veces el founder marcó binary=true al
  // ver la pre-eval IA. Si baja, el evaluador IA está desalineado.
  const preevalEntries = all.filter(
    (e) =>
      e.touchpoint === "ai_preeval_agreement" && typeof e.binary === "boolean",
  );
  const preevalAgreementRate =
    preevalEntries.length === 0
      ? null
      : Math.round(
          (preevalEntries.filter((e) => e.binary === true).length /
            preevalEntries.length) *
            100,
        );

  // Top 20 eventos más recientes (sin PII).
  const latest = [...all]
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, 20)
    .map((e) => ({
      timestamp: e.timestamp,
      touchpoint: inferTouchpoint(e),
      kind: inferKind(e),
      targetType: e.targetType ?? null,
      icsAtTime: e.icsAtTime ?? null,
      rating: e.rating ?? null,
      binary: e.binary ?? e.useful ?? null,
    }));

  // Totales por kind.
  const explicitTotal = all.filter((e) => inferKind(e) === "explicit").length;
  const implicitTotal = total - explicitTotal;

  log.end({
    status: 200,
    extra: { total, touchpoints: touchpoints.length, outcomeCorrelation },
  });

  return NextResponse.json({
    total,
    byKind: { explicit: explicitTotal, implicit: implicitTotal },
    touchpoints,
    calibration: {
      // Correlación ICS al momento del match vs rating final del founder.
      // > +0.5 = motor bien calibrado, predice quién va a entregar bien.
      icsVsOutcomeCorrelation: outcomeCorrelation,
      sampleSize: outcomePairs.length,
      // % de veces que el founder concuerda con la pre-eval IA. Si está
      // bajo, hay que reentrenar el evaluador antes que el matcher.
      aiPreevalAgreementRate: preevalAgreementRate,
      preevalSampleSize: preevalEntries.length,
    },
    latest,
  });
}
