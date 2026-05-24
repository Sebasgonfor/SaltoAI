import { NextRequest, NextResponse } from "next/server";
import {
  listNeedsByOwner,
  listMicroTasksByCompany,
  listFeedback,
  getAllProfiles,
} from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { CompanyNeed, MicroTask, FeedbackEntry, Profile } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Dashboard agregado del founder. Una request, todos los widgets enriquecidos
 * del `/empresa` page se alimentan de aquí.
 *
 * Calculamos cosas que un dashboard "delgado" no podría sacar mirando solo
 * needs+tasks:
 *
 *   - pipelineFunnel: stages del producto y conversion rates entre cada par.
 *     Es la "salud" del producto para esta empresa: cuántos del shortlist
 *     pasaron a perfil-abierto, cuántos a microtask, cuántos a hire.
 *
 *   - calibration: comparación entre ICS predictivo y outcome real (rating
 *     del founder en microtasks). Si el ICS predijo 90 y el founder bajó
 *     un 2/5, marcamos el desalineamiento. Es lo mismo que el flywheel
 *     pero scopeado a UNA empresa.
 *
 *   - topCandidates: perfiles que aparecen en múltiples shortlists del
 *     founder con ICS alto. Útil para priorizar follow-up cross-need.
 *
 *   - needsWithHealth: cada need con un health score derivado del mismo
 *     heuristic de la radiografía (contexto corto, pocas skills, etc.).
 *
 *   - financials: total invertido en microtasks (suma amountCOP), promedio,
 *     # de microtasks pagadas, ratio active/total.
 */

interface PipelineFunnel {
  needsPublished: number;
  totalShortlist: number;       // suma de candidatos rankeados en todas las needs
  profilesOpened: number;       // profile_click signals
  microtasksProposed: number;   // microtask_proposed signals + tasks en DB
  microtasksDelivered: number;  // status=delivered|evaluated|paid
  microtasksRated: number;      // status=evaluated|paid con companyRating
  hiresConfirmed: number;       // post_hire_followup binary=true
  conversionRates: {
    shortlistToOpen: number;
    openToMicrotask: number;
    microtaskToHire: number;
  };
}

interface Calibration {
  totalPaired: number;          // # de pares (ICS, rating) disponibles
  /** Pares con su delta. >0 = motor optimista (predijo alto, founder bajó),
   *  <0 = motor conservador, 0 = alineado. */
  pairs: { icsAtMatch: number; founderRating: number; delta: number }[];
  avgDelta: number;             // promedio de deltas — métrica resumen
  alignmentLabel: "alineado" | "optimista" | "conservador" | "sin_datos";
}

interface TopCandidate {
  profileId: string;
  name: string;
  appearancesInShortlists: number;
  avgIcsAcrossNeeds: number;
  microtasksProposed: number;
  microtasksCompleted: number;
}

interface NeedWithHealth {
  id: string;
  role: string;
  createdAt: number;
  shortlistSize: number;      // 0 si todavía no se calcularon matches
  avgIcs: number;
  healthScore: number;        // 0-100 mismo cálculo que la radiografía
  topIssue: string | null;    // primera issue (la más crítica) para mostrar inline
}

interface Financials {
  totalInvestedCOP: number;
  averageTaskCOP: number;
  paidCount: number;
  pendingCount: number;
}

interface DashboardEmpresaResponse {
  kpis: {
    needsCount: number;
    activeTasks: number;
    pendingEvaluations: number;
    closed: number;
    candidatesInPipeline: number;
    hiresConfirmed: number;
    avgIcsAcrossNeeds: number;
    feedbackReceived: number;
  };
  pipelineFunnel: PipelineFunnel;
  calibration: Calibration;
  topCandidates: TopCandidate[];
  needsWithHealth: NeedWithHealth[];
  financials: Financials;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function computeHealthFromNeed(need: CompanyNeed): {
  score: number;
  topIssue: string | null;
} {
  let score = 100;
  const issues: { severity: number; text: string }[] = [];
  if ((need.context?.trim().length ?? 0) < 80) {
    score -= 25;
    issues.push({ severity: 3, text: "Contexto operativo muy corto." });
  }
  if (need.requiredSkills.length === 0) {
    score -= 30;
    issues.push({ severity: 3, text: "Sin skills declaradas." });
  } else if (need.requiredSkills.length < 3) {
    score -= 10;
    issues.push({ severity: 2, text: "Pocas skills declaradas (<3)." });
  }
  if (need.desiredTraits.length === 0) {
    score -= 5;
    issues.push({ severity: 1, text: "Sin rasgos deseados." });
  }
  issues.sort((a, b) => b.severity - a.severity);
  return {
    score: Math.max(0, score),
    topIssue: issues[0]?.text ?? null,
  };
}

function isRelevantSignal(f: FeedbackEntry, needIds: Set<string>): boolean {
  if (f.needId && needIds.has(f.needId)) return true;
  for (const nid of needIds) {
    if (f.targetId?.startsWith(`${nid}__`)) return true;
    if (f.matchId?.startsWith(`${nid}__`)) return true;
  }
  return false;
}

function computePipelineFunnel(
  needs: CompanyNeed[],
  tasks: MicroTask[],
  signals: FeedbackEntry[],
): PipelineFunnel {
  const needIds = new Set(needs.map((n) => n.id ?? "").filter(Boolean));
  const relevantSignals = signals.filter((f) => isRelevantSignal(f, needIds));

  const profilesOpened = relevantSignals.filter(
    (f) => f.touchpoint === "profile_click" || f.signalType === "implicit_connect",
  ).length;

  // microtasks propuestas: contamos las que existen en DB (más confiable que la
  // señal implícita, porque la señal puede perderse en navegación).
  const microtasksProposed = tasks.length;
  const microtasksDelivered = tasks.filter(
    (t) =>
      t.status === "delivered" ||
      t.status === "evaluated" ||
      t.status === "paid",
  ).length;
  const microtasksRated = tasks.filter(
    (t) =>
      (t.status === "evaluated" || t.status === "paid") &&
      typeof t.companyRating === "number",
  ).length;

  const hiresConfirmed = relevantSignals.filter(
    (f) => f.touchpoint === "post_hire_followup" && f.binary === true,
  ).length;

  // Total shortlist: lo dejamos en 0 acá porque calcular shortlists requeriría
  // pegarle a /api/match por cada need (caro). Lo aproximamos en el cliente
  // si hace falta; para el funnel usamos profilesOpened como proxy de tope.
  const totalShortlist = needs.length * 10; // upper bound, máx 10 por need

  // Conversion rates (defensa contra div-by-zero).
  const safeRate = (num: number, den: number) =>
    den === 0 ? 0 : Math.round((num / den) * 100);

  return {
    needsPublished: needs.length,
    totalShortlist,
    profilesOpened,
    microtasksProposed,
    microtasksDelivered,
    microtasksRated,
    hiresConfirmed,
    conversionRates: {
      shortlistToOpen: safeRate(profilesOpened, totalShortlist),
      openToMicrotask: safeRate(microtasksProposed, Math.max(profilesOpened, 1)),
      microtaskToHire: safeRate(hiresConfirmed, Math.max(microtasksRated, 1)),
    },
  };
}

function computeCalibration(tasks: MicroTask[]): Calibration {
  // Pareamos microtasks con aiEvaluation Y companyRating (las únicas con
  // ground truth + predicción).
  const pairs: Calibration["pairs"] = [];
  for (const t of tasks) {
    const ai = t.aiEvaluation?.overallScore;
    const fr = t.companyRating;
    if (typeof ai !== "number" || typeof fr !== "number") continue;
    // Normalizamos rating 1-5 a 0-100 para comparar.
    const founderNormalized = Math.round((fr / 5) * 100);
    pairs.push({
      icsAtMatch: ai,
      founderRating: fr,
      delta: ai - founderNormalized,
    });
  }
  if (pairs.length === 0) {
    return {
      totalPaired: 0,
      pairs: [],
      avgDelta: 0,
      alignmentLabel: "sin_datos",
    };
  }
  const avgDelta = Math.round(
    pairs.reduce((a, b) => a + b.delta, 0) / pairs.length,
  );
  const alignmentLabel: Calibration["alignmentLabel"] =
    Math.abs(avgDelta) <= 10
      ? "alineado"
      : avgDelta > 0
        ? "optimista"
        : "conservador";
  return { totalPaired: pairs.length, pairs, avgDelta, alignmentLabel };
}

function computeTopCandidates(
  needs: CompanyNeed[],
  signals: FeedbackEntry[],
  tasks: MicroTask[],
  profiles: Profile[],
): TopCandidate[] {
  // Agregamos por profileId: cuántas veces apareció en signals con needId
  // del founder. profile_click + microtask_proposed cuentan como "shortlist
  // activado". Es un proxy: cuando el founder abre/propone tarea, esa
  // candidatura está viva en su pipeline.
  const needIds = new Set(needs.map((n) => n.id ?? "").filter(Boolean));
  const stats = new Map<
    string,
    {
      profileId: string;
      appearances: number;
      icsSum: number;
      icsCount: number;
      tasksProposed: number;
      tasksCompleted: number;
    }
  >();

  for (const f of signals) {
    if (!f.profileId) continue;
    if (!isRelevantSignal(f, needIds)) continue;
    if (
      f.touchpoint !== "profile_click" &&
      f.touchpoint !== "microtask_proposed" &&
      f.signalType !== "implicit_connect" &&
      f.signalType !== "implicit_microtask"
    )
      continue;
    const cur = stats.get(f.profileId) ?? {
      profileId: f.profileId,
      appearances: 0,
      icsSum: 0,
      icsCount: 0,
      tasksProposed: 0,
      tasksCompleted: 0,
    };
    cur.appearances += 1;
    if (typeof f.icsAtTime === "number") {
      cur.icsSum += f.icsAtTime;
      cur.icsCount += 1;
    }
    stats.set(f.profileId, cur);
  }

  // Tareas: por profileId.
  for (const t of tasks) {
    if (!t.profileId) continue;
    const cur = stats.get(t.profileId) ?? {
      profileId: t.profileId,
      appearances: 0,
      icsSum: 0,
      icsCount: 0,
      tasksProposed: 0,
      tasksCompleted: 0,
    };
    cur.tasksProposed += 1;
    if (
      t.status === "evaluated" ||
      t.status === "paid" ||
      t.status === "delivered"
    ) {
      cur.tasksCompleted += 1;
    }
    stats.set(t.profileId, cur);
  }

  // Join con profiles para el nombre. Si no encontramos, dejamos "Candidato"
  // anónimo (el founder igual puede entrar al perfil con el id).
  const profileById = new Map(profiles.map((p) => [p.id ?? "", p]));

  return Array.from(stats.values())
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 5)
    .map((s) => ({
      profileId: s.profileId,
      name: profileById.get(s.profileId)?.name ?? "Candidato",
      appearancesInShortlists: s.appearances,
      avgIcsAcrossNeeds:
        s.icsCount === 0 ? 0 : Math.round(s.icsSum / s.icsCount),
      microtasksProposed: s.tasksProposed,
      microtasksCompleted: s.tasksCompleted,
    }));
}

function computeFinancials(tasks: MicroTask[]): Financials {
  const total = tasks.reduce((a, t) => a + (t.amountCOP ?? 0), 0);
  const paidCount = tasks.filter(
    (t) => t.status === "paid" || t.status === "evaluated",
  ).length;
  const pendingCount = tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress",
  ).length;
  return {
    totalInvestedCOP: total,
    averageTaskCOP:
      tasks.length === 0 ? 0 : Math.round(total / tasks.length),
    paidCount,
    pendingCount,
  };
}

// ─── handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const log = startLog(req, "dashboard.empresa");
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) {
    log.end({ status: 400, extra: { reason: "missing_uid" } });
    return NextResponse.json(
      { error: "Falta ?uid=", code: "uid_required" },
      { status: 400 },
    );
  }

  // Paralelo: needs del founder + sus microtasks + feedback log + perfiles.
  const [needs, tasks, signals, profiles] = await Promise.all([
    listNeedsByOwner(uid),
    listMicroTasksByCompany(uid),
    listFeedback(),
    getAllProfiles(),
  ]);

  // KPIs base (los mismos que ya muestra el dashboard +  enriquecidos).
  const activeTasks = tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress",
  ).length;
  const pendingEvaluations = tasks.filter(
    (t) => t.status === "delivered",
  ).length;
  const closed = tasks.filter(
    (t) => t.status === "evaluated" || t.status === "paid",
  ).length;

  const needIds = new Set(needs.map((n) => n.id ?? "").filter(Boolean));
  const relevantSignals = signals.filter((f) =>
    isRelevantSignal(f, needIds),
  );

  // Candidates in pipeline: # único de profileIds que aparecieron en señales
  // relevantes (excluyendo descartes/pass).
  const inPipeline = new Set<string>();
  for (const f of relevantSignals) {
    if (
      f.profileId &&
      f.touchpoint !== "company_pass_reason" &&
      f.useful !== false
    ) {
      inPipeline.add(f.profileId);
    }
  }
  // También sumamos los profileIds que tienen microtask con este founder.
  for (const t of tasks) {
    if (t.profileId) inPipeline.add(t.profileId);
  }

  const hiresConfirmed = relevantSignals.filter(
    (f) => f.touchpoint === "post_hire_followup" && f.binary === true,
  ).length;

  // ICS promedio en pipeline (signals con icsAtTime).
  const icsValues = relevantSignals
    .map((f) => f.icsAtTime)
    .filter((x): x is number => typeof x === "number");
  const avgIcsAcrossNeeds =
    icsValues.length === 0
      ? 0
      : Math.round(icsValues.reduce((a, b) => a + b, 0) / icsValues.length);

  // # de feedback recibido (votos útiles + pass reasons + matches buenos).
  const feedbackReceived = relevantSignals.filter(
    (f) =>
      f.touchpoint === "match_useful" ||
      f.touchpoint === "company_feedback_to_youth" ||
      f.touchpoint === "company_pass_reason" ||
      f.signalType === "explicit_vote",
  ).length;

  // Needs con health.
  const needsWithHealth: NeedWithHealth[] = needs.map((n) => {
    const h = computeHealthFromNeed(n);
    // ICS promedio scopeado a esta need (signals que la apuntan).
    const needIcsValues = signals
      .filter(
        (f) =>
          f.needId === n.id ||
          f.targetId?.startsWith(`${n.id}__`) ||
          f.matchId?.startsWith(`${n.id}__`),
      )
      .map((f) => f.icsAtTime)
      .filter((x): x is number => typeof x === "number");
    return {
      id: n.id ?? "",
      role: n.role,
      createdAt: n.createdAt,
      shortlistSize: Math.min(10, needIcsValues.length),
      avgIcs:
        needIcsValues.length === 0
          ? 0
          : Math.round(
              needIcsValues.reduce((a, b) => a + b, 0) /
                needIcsValues.length,
            ),
      healthScore: h.score,
      topIssue: h.topIssue,
    };
  });

  log.end({
    status: 200,
    extra: {
      uid,
      needs: needs.length,
      tasks: tasks.length,
      signals: relevantSignals.length,
    },
  });

  const response: DashboardEmpresaResponse = {
    kpis: {
      needsCount: needs.length,
      activeTasks,
      pendingEvaluations,
      closed,
      candidatesInPipeline: inPipeline.size,
      hiresConfirmed,
      avgIcsAcrossNeeds,
      feedbackReceived,
    },
    pipelineFunnel: computePipelineFunnel(needs, tasks, signals),
    calibration: computeCalibration(tasks),
    topCandidates: computeTopCandidates(needs, signals, tasks, profiles),
    needsWithHealth,
    financials: computeFinancials(tasks),
  };

  return NextResponse.json(response);
}
