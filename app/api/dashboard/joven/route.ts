import { NextRequest, NextResponse } from "next/server";
import {
  getProfile,
  listMicroTasksByProfile,
  listFeedback,
  listDocumentsByProfile,
  getAllNeeds,
} from "@/lib/db";
import { startLog } from "@/lib/logger";
import type { FeedbackEntry, MicroTask, ProfileDocument } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Dashboard agregado del joven. Una request, todos los widgets del
 * `/dashboard` page se alimentan de aquí.
 *
 * Diseñado para mostrarle al joven cosas que NINGÚN producto le da:
 *
 *   - earnings: cuánto ganó en microtasks (suma amountCOP de status=paid|evaluated),
 *     promedio de rating, # completed. LinkedIn no muestra esto porque LinkedIn
 *     no media transacciones.
 *
 *   - marketVisibility: cuántas necesidades activas en la plataforma están
 *     pidiendo skills que el joven TIENE. Le da sensación de mercado en
 *     tiempo real, no "tu CV está guardado".
 *
 *   - inboxSummary: feedbacks recibidos sin leer (counts por tipo). Va al
 *     widget de inbox que ya existe en /joven/perfil/[id].
 *
 *   - verifiedSkills: cuántas de las skills declaradas tienen evidencia en
 *     documento subido. Subir un certificado convierte una skill "dicha"
 *     en "verificada" — el founder le da más peso.
 *
 *   - topOpportunityPreview: la mejor opportunity actual (mayor ICS). Sin
 *     hacer el query completo de /api/oportunidades (caro), solo el highlight.
 *
 *   - activityTimeline: últimos N eventos del joven (microtask propuesta,
 *     feedback recibido, evaluación final). Como un feed de Twitter de su carrera.
 */

interface Earnings {
  totalCOP: number;
  averageRating: number;       // 0-5 sobre microtasks evaluadas
  completedCount: number;
  pendingCount: number;
}

interface MarketVisibility {
  totalActiveNeeds: number;
  needsMatchingMySkills: number;
  topSkillsInDemand: { skill: string; demandedBy: number; iHaveIt: boolean }[];
}

interface InboxSummary {
  total: number;
  positiveFeedback: number;     // company_feedback_to_youth con rating >= 4
  passReasons: number;          // company_pass_reason (descartes)
  unreplied: number;            // parents sin youth_reply_to_company
}

interface VerifiedSkills {
  declared: number;
  verified: number;             // declaradas con respaldo documental (match por token)
  verifiedPct: number;          // max(ratio skills verificadas, crédito por credenciales)
  documents: number;            // documentos válidos subidos (credenciales)
}

interface TopOpportunityPreview {
  needId: string;
  companyName: string;
  role: string;
  /** ICS heurístico aproximado: solo lookup, no llamada al LLM. */
  approxIcs: number;
}

interface ActivityEvent {
  type:
    | "microtask_proposed"
    | "microtask_delivered"
    | "microtask_evaluated"
    | "feedback_received"
    | "pass_reason"
    | "profile_viewed";
  ts: number;
  title: string;
  hint?: string;
}

interface DashboardJovenResponse {
  earnings: Earnings;
  marketVisibility: MarketVisibility;
  inboxSummary: InboxSummary;
  verifiedSkills: VerifiedSkills;
  topOpportunity: TopOpportunityPreview | null;
  activityTimeline: ActivityEvent[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function computeEarnings(tasks: MicroTask[]): Earnings {
  const paid = tasks.filter(
    (t) => t.status === "paid" || t.status === "evaluated",
  );
  const totalCOP = paid.reduce((a, t) => a + (t.amountCOP ?? 0), 0);
  const ratings = paid
    .map((t) => t.companyRating)
    .filter((x): x is number => typeof x === "number" && x > 0);
  const avgRating =
    ratings.length === 0
      ? 0
      : Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10;
  const pendingCount = tasks.filter(
    (t) =>
      t.status === "pending" ||
      t.status === "in_progress" ||
      t.status === "delivered",
  ).length;
  return {
    totalCOP,
    averageRating: avgRating,
    completedCount: paid.length,
    pendingCount,
  };
}

function computeMarketVisibility(
  mySkills: string[],
  allNeeds: { requiredSkills: string[] }[],
): MarketVisibility {
  const norm = (s: string) => s.toLowerCase().trim();
  const mySet = new Set(mySkills.map(norm));

  // Necesidades que matchean al menos una skill mía.
  let matchingNeeds = 0;
  // Demanda por skill: cuántas necesidades la piden.
  const demandBy = new Map<string, { canonical: string; count: number }>();
  for (const n of allNeeds) {
    let touches = false;
    for (const req of n.requiredSkills) {
      const k = norm(req);
      const cur = demandBy.get(k);
      if (cur) cur.count += 1;
      else demandBy.set(k, { canonical: req, count: 1 });
      // Match si mySkills contiene esta skill (incluido directional).
      const matched = Array.from(mySet).some(
        (m) => m.includes(k) || k.includes(m),
      );
      if (matched) touches = true;
    }
    if (touches) matchingNeeds += 1;
  }

  // Top 5 skills más demandadas + flag si el joven la tiene.
  const topSkillsInDemand = Array.from(demandBy.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((d) => ({
      skill: d.canonical,
      demandedBy: d.count,
      iHaveIt: Array.from(mySet).some(
        (m) =>
          m.includes(d.canonical.toLowerCase()) ||
          d.canonical.toLowerCase().includes(m),
      ),
    }));

  return {
    totalActiveNeeds: allNeeds.length,
    needsMatchingMySkills: matchingNeeds,
    topSkillsInDemand,
  };
}

function computeInbox(
  profileId: string,
  signals: FeedbackEntry[],
): InboxSummary {
  const parents = signals.filter(
    (f) =>
      (f.touchpoint === "company_feedback_to_youth" ||
        f.touchpoint === "company_pass_reason") &&
      f.targetType === "profile" &&
      f.targetId === profileId,
  );
  const replies = signals.filter(
    (f) => f.touchpoint === "youth_reply_to_company" && !!f.parentFeedbackId,
  );
  const repliedParentIds = new Set(
    replies.map((r) => r.parentFeedbackId as string),
  );
  const positiveFeedback = parents.filter(
    (f) =>
      f.touchpoint === "company_feedback_to_youth" && (f.rating ?? 0) >= 4,
  ).length;
  const passReasons = parents.filter(
    (f) => f.touchpoint === "company_pass_reason",
  ).length;
  const unreplied = parents.filter(
    (p) => !repliedParentIds.has(p.id ?? ""),
  ).length;
  return { total: parents.length, positiveFeedback, passReasons, unreplied };
}

function computeVerifiedSkills(
  declaredSkills: string[],
  documents: ProfileDocument[],
): VerifiedSkills {
  const norm = (s: string) => s.toLowerCase().trim();
  const declared = declaredSkills.length;

  // Documentos "válidos" = subidos y procesados con info real (skills extraídas,
  // título de programa o tipo reconocido). Un diploma SIN skills igual cuenta:
  // es una credencial verificable en sí misma (caso reportado: "subí mi diploma
  // y no lo marca").
  const validDocs = documents.filter(
    (d) =>
      (d.extractedSkills?.length ?? 0) > 0 ||
      !!d.programTitle?.trim() ||
      (!!d.kind && d.kind !== "otro"),
  );
  const docsCount = validDocs.length;

  // Skills declaradas con respaldo documental. Match por token (no solo exacto):
  // "Reclutamiento" respalda "Reclutamiento IT", etc.
  const docSkillKeys = new Set<string>();
  const docTokens = new Set<string>();
  for (const d of validDocs) {
    for (const e of d.extractedSkills ?? []) {
      const k = norm(e.skill);
      if (!k) continue;
      docSkillKeys.add(k);
      for (const tok of k.split(/\s+/)) if (tok.length >= 4) docTokens.add(tok);
    }
  }
  let verified = 0;
  for (const s of declaredSkills) {
    const k = norm(s);
    if (!k) continue;
    const direct = [...docSkillKeys].some((x) => x.includes(k) || k.includes(x));
    const byToken = k.split(/\s+/).some((tok) => tok.length >= 4 && docTokens.has(tok));
    if (direct || byToken) verified += 1;
  }

  // verifiedPct = el MAYOR entre (a) ratio de skills verificadas y (b) crédito
  // por credenciales subidas (1 doc ≈ 50%, 2+ ≈ 100%). Así subir un diploma
  // —aunque no calce con las skills declaradas— SÍ mueve el indicador.
  const skillPart = declared > 0 ? verified / declared : 0;
  const docPart = docsCount > 0 ? Math.min(1, docsCount / 2) : 0;
  const verifiedPct = Math.round(Math.max(skillPart, docPart) * 100);

  return { declared, verified, verifiedPct, documents: docsCount };
}

/**
 * Lookup barato del top opportunity: la need con más overlap de required
 * skills vs las del joven. No ejecutamos el LLM (sería caro y lento) —
 * usamos jaccard simple sobre normalized skills. El score es una
 * APROXIMACIÓN, no el ICS real. UI lo muestra como "preview".
 */
function computeTopOpportunity(
  mySkills: string[],
  needs: { id?: string; companyName: string; role: string; requiredSkills: string[] }[],
): TopOpportunityPreview | null {
  if (needs.length === 0 || mySkills.length === 0) return null;
  const norm = (s: string) => s.toLowerCase().trim();
  const mySet = new Set(mySkills.map(norm));
  let best: { id: string; companyName: string; role: string; score: number } | null =
    null;
  for (const n of needs) {
    if (!n.id) continue;
    const reqSet = new Set(n.requiredSkills.map(norm));
    if (reqSet.size === 0) continue;
    let overlap = 0;
    for (const r of reqSet) {
      const hit = Array.from(mySet).some((m) => m.includes(r) || r.includes(m));
      if (hit) overlap += 1;
    }
    if (overlap === 0) continue;
    const score = Math.round((overlap / reqSet.size) * 100);
    if (!best || score > best.score) {
      best = {
        id: n.id,
        companyName: n.companyName,
        role: n.role,
        score,
      };
    }
  }
  if (!best) return null;
  return {
    needId: best.id,
    companyName: best.companyName,
    role: best.role,
    approxIcs: best.score,
  };
}

function buildActivityTimeline(
  profileId: string,
  tasks: MicroTask[],
  signals: FeedbackEntry[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  // Microtasks events.
  for (const t of tasks) {
    if (t.createdAt) {
      events.push({
        type: "microtask_proposed",
        ts: t.createdAt,
        title: `Te propusieron una microtask: "${t.title}"`,
        hint: `${t.companyName} · $${(t.amountCOP ?? 0).toLocaleString("es-CO")} COP`,
      });
    }
    if (t.deliveredAt) {
      events.push({
        type: "microtask_delivered",
        ts: t.deliveredAt,
        title: `Entregaste "${t.title}"`,
        hint: t.aiEvaluation?.overallScore
          ? `Pre-eval IA: ${t.aiEvaluation.overallScore}/100`
          : undefined,
      });
    }
    if (t.evaluatedAt && t.companyRating) {
      events.push({
        type: "microtask_evaluated",
        ts: t.evaluatedAt,
        title: `Te evaluaron en "${t.title}": ${t.companyRating}/5`,
        hint: t.companyName,
      });
    }
  }

  // Feedback recibido / descartes.
  const myInbox = signals.filter(
    (f) =>
      f.targetType === "profile" &&
      f.targetId === profileId &&
      (f.touchpoint === "company_feedback_to_youth" ||
        f.touchpoint === "company_pass_reason"),
  );
  for (const f of myInbox) {
    if (f.touchpoint === "company_feedback_to_youth") {
      events.push({
        type: "feedback_received",
        ts: f.timestamp ?? 0,
        title: `${f.authorDisplayName ?? "Una empresa"} te dejó feedback`,
        hint:
          f.rating !== undefined
            ? `${f.rating}/5${f.text ? ` · "${f.text.slice(0, 60)}..."` : ""}`
            : f.text?.slice(0, 80),
      });
    } else if (f.touchpoint === "company_pass_reason") {
      events.push({
        type: "pass_reason",
        ts: f.timestamp ?? 0,
        title: `${f.authorDisplayName ?? "Una empresa"} no avanzó: razón pendiente`,
        hint: f.text?.slice(0, 80),
      });
    }
  }

  // Profile views (clicks de empresa abriendo el perfil).
  const views = signals.filter(
    (f) =>
      f.profileId === profileId &&
      (f.touchpoint === "profile_click" ||
        f.signalType === "implicit_connect"),
  );
  // No spammear: una entry por click es ruido. Resumimos en bloques diarios.
  const viewsByDay = new Map<string, number>();
  for (const v of views) {
    const day = new Date(v.timestamp ?? 0).toISOString().slice(0, 10);
    viewsByDay.set(day, (viewsByDay.get(day) ?? 0) + 1);
  }
  for (const [day, count] of viewsByDay) {
    const ts = new Date(`${day}T12:00:00Z`).getTime();
    events.push({
      type: "profile_viewed",
      ts,
      title: count === 1 ? "1 empresa abrió tu perfil" : `${count} empresas abrieron tu perfil`,
      hint: day,
    });
  }

  return events.sort((a, b) => b.ts - a.ts).slice(0, 10);
}

// ─── handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const log = startLog(req, "dashboard.joven");
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) {
    log.end({ status: 400, extra: { reason: "missing_uid" } });
    return NextResponse.json(
      { error: "Falta ?uid=", code: "uid_required" },
      { status: 400 },
    );
  }

  // Paralelo: profile + tasks + signals + documentos + all needs.
  const [profile, tasks, signals, documents, allNeeds] = await Promise.all([
    getProfile(uid),
    listMicroTasksByProfile(uid),
    listFeedback(),
    listDocumentsByProfile(uid),
    getAllNeeds(),
  ]);

  // Si todavía no hay perfil, devolvemos shape vacío (no es error: el joven
  // recién creó cuenta, todavía no hizo la entrevista). El cliente lo muestra
  // como empty state.
  const mySkills = profile?.skills ?? [];

  const response: DashboardJovenResponse = {
    earnings: computeEarnings(tasks),
    marketVisibility: computeMarketVisibility(mySkills, allNeeds),
    inboxSummary: computeInbox(uid, signals),
    verifiedSkills: computeVerifiedSkills(mySkills, documents),
    topOpportunity: computeTopOpportunity(mySkills, allNeeds),
    activityTimeline: buildActivityTimeline(uid, tasks, signals),
  };

  log.end({
    status: 200,
    extra: {
      uid,
      hasProfile: !!profile,
      tasks: tasks.length,
      docs: documents.length,
    },
  });

  return NextResponse.json(response);
}
