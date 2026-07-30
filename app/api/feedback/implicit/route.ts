import { NextRequest, NextResponse } from "next/server";
import { recordFeedback } from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { FeedbackSignal } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/feedback/implicit — registra señales que NO son votos explícitos.
 *
 * Cuándo se llama:
 *   - El founder clickea "Quiero conectar" en un match card → connect
 *   - El founder envía una micro-tarea a un candidato → microtask_proposed
 *   - La micro-tarea es completada y rateada → outcome
 *
 * Diferencia con POST /api/feedback (votos explícitos): acá NO le pedimos
 * al founder que opine; capturamos su comportamiento. Las señales implícitas
 * pesan menos en el motor (ver lib/feedback-signal.ts), pero acumulan
 * volumen mucho más rápido.
 *
 * Fire-and-forget: el cliente NO espera la respuesta. Si falla, no rompe
 * la UX del founder.
 */
export async function POST(req: NextRequest) {
  const log = startLog(req, "feedback.implicit");
  try {
    const body = (await req.json()) as {
      needId?: string;
      profileId?: string;
      signal: "connect" | "microtask_proposed" | "outcome" | "joven_interest";
      score?: number; // solo para outcome
      icsAtTime?: number;
      /** Solo para joven_interest: el rol que el joven indica querer aplicar.
       * Mejora la traza cuando una empresa publicó múltiples needs. */
      jovenSource?: "oportunidades" | "perfil" | "match";
    };

    if (!body.needId || !body.profileId || !body.signal) {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        { error: "needId, profileId y signal son requeridos", code: "fields_required" },
        { status: 400 }
      );
    }

    // Mapeo signal → FeedbackSignal + boolean útil + score
    let signalType: FeedbackSignal;
    let useful: boolean;
    let score: number | undefined;
    let source: "empresa_match" | "joven_perfil" | "other" = "empresa_match";
    switch (body.signal) {
      case "connect":
        signalType = "implicit_connect";
        useful = true;
        break;
      case "microtask_proposed":
        signalType = "implicit_microtask";
        useful = true;
        break;
      case "outcome":
        signalType = "microtask_outcome";
        score = typeof body.score === "number" ? body.score : undefined;
        // Mapeo de rating a useful: >=4 sí, <=2 no, 3 neutro.
        useful = (score ?? 3) >= 4;
        break;
      case "joven_interest":
        // El joven mostró interés en una oportunidad. Bidireccional con
        // implicit_connect (que es del founder). Cuando hay ambas, es match
        // mutuo de alta señal — el motor lo trata como evidencia fuerte.
        signalType = "joven_interest";
        useful = true;
        source = "joven_perfil";
        break;
      default:
        log.end({ status: 400, extra: { reason: "invalid_signal" } });
        return NextResponse.json(
          { error: "signal debe ser connect | microtask_proposed | outcome | joven_interest" },
          { status: 400 }
        );
    }

    const matchId = `${body.needId}__${body.profileId}`;
    const id = await recordFeedback({
      matchId,
      needId: body.needId,
      profileId: body.profileId,
      useful,
      source,
      signalType,
      ...(score !== undefined && { score }),
      ...(typeof body.icsAtTime === "number" && { icsAtTime: body.icsAtTime }),
      note: `implicit:${body.signal}${body.jovenSource ? `:${body.jovenSource}` : ""}`,
    });

    log.end({
      status: 200,
      extra: { feedbackId: id, signalType, useful, score },
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    log.error("feedback.implicit.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos guardar la señal.", code: "unknown" },
      { status: 500 }
    );
  }
}
