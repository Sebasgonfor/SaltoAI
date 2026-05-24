import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey, isQuotaError } from "@/lib/gemini";
import {
  countMicroTasksBetween,
  createMicroTask,
  getMicroTask,
  getProfile,
} from "@/lib/db";
import type { MicroTask } from "@/lib/types";

export const runtime = "nodejs";

const STRUCTURE_PROMPT = `Eres el estructurador de micro-tareas pagadas de Salto.
Recibes:
1. El contexto del candidato (perfil de evidencia ya extraído).
2. La intención libre de la empresa: qué quiere probar y cuánto va a pagar.

Tu trabajo es convertir esa intención en una micro-tarea CONCRETA, JUSTA Y EVALUABLE.

Reglas:
- title: título corto, accionable, en español natural (no jerga corporativa). Ej: "Escribe 3 captions para Instagram de panadería de barrio".
- brief: 2-4 frases que el joven leerá. Explica el contexto del negocio, el objetivo concreto del entregable, y el tono esperado. Lenguaje cercano, no contratual.
- expectedDeliverable: 1 frase con qué tiene que entregar exactamente (formato + límite). Ej: "Texto plano con los 3 captions, máximo 280 caracteres cada uno".
- criteria: 3 criterios de evaluación 0-100, cada uno con name corto + description de 1 frase de qué se mide. Debe haber AL MENOS un criterio que NO sea "calidad técnica" — ej. "ajuste al tono del negocio", "iniciativa creativa", "respeto al brief".
- deadlineHours: número de horas razonable para entregar (24-72 típico para tareas de 1-4h reales).
- amountCOPSuggested: si la empresa dio un monto, respétalo. Si no, sugiere uno proporcional al esfuerzo real (rango realista LATAM: 30.000–200.000 COP para tareas de 1-4h).

CRÍTICO:
- NO inventes detalles del negocio que la empresa no haya mencionado. Si falta contexto, usa "según el contexto que nos diste" en el brief.
- NO redactes en lenguaje legal/contractual. Es una micro-tarea, no un contrato laboral.
- El brief debe tener tono de founder hablandole a un junior, no de RRHH corporativa.
- Idioma: español LATAM natural.`;

const criterionSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
  },
  required: ["name", "description"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    brief: { type: Type.STRING },
    expectedDeliverable: { type: Type.STRING },
    criteria: { type: Type.ARRAY, items: criterionSchema },
    deadlineHours: { type: Type.NUMBER },
    amountCOPSuggested: { type: Type.NUMBER },
  },
  required: ["title", "brief", "expectedDeliverable", "criteria", "deadlineHours", "amountCOPSuggested"],
};

function mockStructure(rawRequest: string): {
  title: string;
  brief: string;
  expectedDeliverable: string;
  criteria: { name: string; description: string }[];
  deadlineHours: number;
  amountCOPSuggested: number;
} {
  return {
    title: "Micro-tarea de prueba",
    brief: `Trabajo concreto para probar al candidato antes de contratación formal. Contexto: ${rawRequest.slice(0, 200)}.`,
    expectedDeliverable: "Entrega un documento de texto con tu propuesta resuelta.",
    criteria: [
      { name: "Comprensión del brief", description: "¿Entendió lo que se le pidió?" },
      { name: "Iniciativa", description: "¿Propuso algo más allá de lo literal?" },
      { name: "Calidad del output", description: "¿El resultado es usable en producción?" },
    ],
    deadlineHours: 48,
    amountCOPSuggested: 80000,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      companyId: string;
      companyName: string;
      profileId: string;
      rawRequest: string;
      amountCOP?: number;
      needId?: string;
    };

    if (!body.companyId || !body.companyName || !body.profileId || !body.rawRequest?.trim()) {
      return NextResponse.json(
        { error: "companyId, companyName, profileId, rawRequest son requeridos" },
        { status: 400 }
      );
    }

    const profile = await getProfile(body.profileId);
    if (!profile) return NextResponse.json({ error: "candidato no encontrado" }, { status: 404 });

    // Anti-explotación: máximo 2 tareas activas/históricas con el mismo joven sin contratación formal
    const previousCount = await countMicroTasksBetween(body.companyId, body.profileId);
    const exploitationWarning =
      previousCount >= 2
        ? "Ya propusiste 2 o más micro-tareas a este candidato. Si confías en su trabajo, considera ofrecerle una contratación formal — Salto monitorea uso recurrente sin oferta para proteger a los jóvenes."
        : null;

    let structured: ReturnType<typeof mockStructure>;
    if (!hasGeminiKey()) {
      structured = mockStructure(body.rawRequest);
    } else {
      try {
        const payload = {
          candidato: {
            name: profile.name,
            summary: profile.summary,
            skills: profile.skills,
            traits: profile.traits,
          },
          intencionEmpresa: body.rawRequest,
          montoOfrecidoCOP: body.amountCOP ?? null,
        };
        const response = await gemini().models.generateContent({
          model: GEMINI_LITE_MODEL,
          contents: `${STRUCTURE_PROMPT}\n\nINPUT:\n${JSON.stringify(payload, null, 2)}`,
          config: { responseMimeType: "application/json", responseSchema },
        });
        const parsed = JSON.parse(response.text || "{}");
        structured = {
          title: parsed.title || "Micro-tarea",
          brief: parsed.brief || "",
          expectedDeliverable: parsed.expectedDeliverable || "",
          criteria: Array.isArray(parsed.criteria) ? parsed.criteria : [],
          deadlineHours: Number(parsed.deadlineHours) || 48,
          amountCOPSuggested: Number(parsed.amountCOPSuggested) || body.amountCOP || 80000,
        };
      } catch (e) {
        if (isQuotaError(e)) {
          console.warn("[microtask/proponer] quota exhausted, falling back to mock");
          structured = mockStructure(body.rawRequest);
        } else {
          throw e;
        }
      }
    }

    const finalAmount = body.amountCOP ?? structured.amountCOPSuggested;

    const taskData: Omit<MicroTask, "id" | "createdAt"> = {
      companyId: body.companyId,
      companyName: body.companyName,
      profileId: body.profileId,
      profileName: profile.name,
      needId: body.needId,
      title: structured.title,
      rawRequest: body.rawRequest,
      brief: structured.brief,
      expectedDeliverable: structured.expectedDeliverable,
      criteria: structured.criteria,
      amountCOP: finalAmount,
      deadlineHours: structured.deadlineHours,
      status: "pending",
    };

    const id = await createMicroTask(taskData);
    const saved = await getMicroTask(id);
    return NextResponse.json({ id, task: saved, exploitationWarning });
  } catch (err) {
    console.error("microtask/proponer error:", err);
    return NextResponse.json({ error: "No pudimos estructurar la micro-tarea." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const t = await getMicroTask(id);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ task: t });
}
