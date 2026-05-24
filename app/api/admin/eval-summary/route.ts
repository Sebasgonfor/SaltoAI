import { NextRequest, NextResponse } from "next/server";
import { listFeedback } from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { FeedbackEntry, FeedbackSignal } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Dashboard de calibración del motor ICS. Token-protegido.
 *
 * Responde a la pregunta: "¿el modelo está acertando?"
 *
 * Devuelve agregados sobre toda la colección de feedback:
 *   - Total de eventos por signalType
 *   - Distribución de useful (sí/no) por source
 *   - Correlación entre icsAtTime y useful — si predice 90% y el founder
 *     marca 👎, esa es la señal de que estamos inflados.
 *   - Buckets de ICS (0-20, 20-40, 40-60, 60-80, 80-100) con % de useful
 *     en cada bucket. Si los buckets altos tienen alta % useful y los
 *     bajos tienen baja, el modelo está bien calibrado.
 *   - Últimos 10 eventos para sanity check.
 *
 * No expone ningún dato sensible — agregados estadísticos solamente.
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 8) return false;
  const got = req.headers.get("x-admin-token") || "";
  return got === expected;
}

interface Bucket {
  range: string;
  total: number;
  useful: number;
  notUseful: number;
  usefulRate: number;
}

function bucketize(entries: FeedbackEntry[]): Bucket[] {
  const buckets: Bucket[] = [
    { range: "0-20", total: 0, useful: 0, notUseful: 0, usefulRate: 0 },
    { range: "20-40", total: 0, useful: 0, notUseful: 0, usefulRate: 0 },
    { range: "40-60", total: 0, useful: 0, notUseful: 0, usefulRate: 0 },
    { range: "60-80", total: 0, useful: 0, notUseful: 0, usefulRate: 0 },
    { range: "80-100", total: 0, useful: 0, notUseful: 0, usefulRate: 0 },
  ];
  for (const e of entries) {
    if (typeof e.icsAtTime !== "number") continue;
    const idx = Math.min(4, Math.floor(e.icsAtTime / 20));
    const b = buckets[idx];
    b.total++;
    if (e.useful) b.useful++;
    else b.notUseful++;
  }
  for (const b of buckets) {
    b.usefulRate = b.total === 0 ? 0 : Math.round((b.useful / b.total) * 100);
  }
  return buckets;
}

/** Correlación Pearson simple entre icsAtTime y useful (1/0). */
function correlation(entries: FeedbackEntry[]): number {
  const valid = entries.filter((e) => typeof e.icsAtTime === "number");
  if (valid.length < 2) return 0;
  const xs = valid.map((e) => e.icsAtTime as number);
  const ys: number[] = valid.map((e) => (e.useful ? 1 : 0));
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
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
  const log = startLog(req, "admin.eval-summary");
  if (!isAuthorized(req)) {
    log.end({ status: 401 });
    return NextResponse.json(
      { error: "unauthorized — requires x-admin-token header" },
      { status: 401 }
    );
  }

  const all = await listFeedback();

  // Total por signalType
  const bySignalType: Record<FeedbackSignal | "unknown", number> = {
    explicit_vote: 0,
    implicit_connect: 0,
    implicit_microtask: 0,
    microtask_outcome: 0,
    joven_interest: 0,
    unknown: 0,
  };
  for (const f of all) {
    const t = (f.signalType ?? "explicit_vote") as keyof typeof bySignalType;
    bySignalType[t] = (bySignalType[t] ?? 0) + 1;
  }

  // Solo votos explícitos para correlación (los implícitos no tienen el dato
  // "no me sirvió" como contraparte clara — son siempre positivos).
  const explicit = all.filter((f) => (f.signalType ?? "explicit_vote") === "explicit_vote");
  const buckets = bucketize(explicit);
  const corr = correlation(explicit);

  // Microtask outcomes son la señal más fuerte
  const outcomes = all.filter((f) => f.signalType === "microtask_outcome");
  const outcomeAvgRating =
    outcomes.length === 0
      ? null
      : Math.round(
          (outcomes.reduce((a, b) => a + (b.score ?? 0), 0) / outcomes.length) * 10,
        ) / 10;

  // Últimos 10 eventos
  const latest = [...all]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
    .map((f) => ({
      timestamp: f.timestamp,
      signalType: f.signalType ?? "explicit_vote",
      useful: f.useful,
      score: f.score,
      icsAtTime: f.icsAtTime,
      matchId: f.matchId,
    }));

  log.end({
    status: 200,
    extra: { totalFeedback: all.length, explicitCount: explicit.length, corr },
  });

  return NextResponse.json({
    totalFeedback: all.length,
    bySignalType,
    explicit: {
      count: explicit.length,
      usefulCount: explicit.filter((f) => f.useful).length,
      notUsefulCount: explicit.filter((f) => !f.useful).length,
    },
    calibration: {
      // Correlación entre ICS predicho y useful=true (rango -1 a +1).
      // > +0.5 = bien calibrado. ~0 = el ICS no predice nada. < 0 = invertido.
      icsVsUsefulCorrelation: corr,
      buckets,
      interpretation:
        corr > 0.5
          ? "Bien calibrado: ICS alto correlaciona con feedback positivo."
          : corr > 0.2
            ? "Calibración débil pero positiva. Más datos lo van a mejorar."
            : corr > -0.2
              ? "Sin señal de calibración (poca data o modelo no discrimina)."
              : "Anti-calibrado: ICS alto correlaciona con feedback negativo. Revisar el motor.",
    },
    microtaskOutcomes: {
      count: outcomes.length,
      averageRating: outcomeAvgRating,
    },
    latest,
  });
}
