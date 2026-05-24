import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey, isQuotaError } from "@/lib/gemini";
import { getMicroTask, updateMicroTask } from "@/lib/db";
import type { CriterionScore, MicroTask } from "@/lib/types";

export const runtime = "nodejs";

const EVALUATE_PROMPT = `Eres el pre-evaluador IA de Salto.
Recibes una micro-tarea (con su brief, entregable esperado y criterios) + el entregable que envió el joven.
Tu trabajo es dar una pre-evaluación HONESTA Y CONSTRUCTIVA, no inflar ni destruir.

Reglas:
- criteriaScores: para CADA criterio que recibís, devuelves {name, score (0-100), comment (1 frase justificando con cita textual del entregable cuando aplique)}.
- overallScore: número 0-100. Pondera los criterios de forma razonable, no es un promedio simple — los criterios más relevantes pesan más.
- overallComment: 2-3 frases dirigidas al founder. Empieza por lo que el joven hizo bien (1 cita), luego lo que falta o se quedó corto, y cierra con una recomendación accionable ("vale la pena entrevistarlo", "pedirle iteración", "no encaja para este rol específico").

CRÍTICO:
- NO inventes contenido que no esté en el entregable. Si el entregable está vacío o no aborda lo pedido, dilo y baja los scores honestamente.
- NO castigues por errores menores de ortografía a menos que el criterio sea explícitamente sobre calidad de escritura.
- NO inflar: si la calidad es media, 50-65, no 85.
- Idioma: español LATAM.`;

const scoreSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    score: { type: Type.NUMBER },
    comment: { type: Type.STRING },
  },
  required: ["name", "score", "comment"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    criteriaScores: { type: Type.ARRAY, items: scoreSchema },
    overallScore: { type: Type.NUMBER },
    overallComment: { type: Type.STRING },
  },
  required: ["criteriaScores", "overallScore", "overallComment"],
};

function mockEvaluation(task: MicroTask): NonNullable<MicroTask["aiEvaluation"]> {
  return {
    criteriaScores: task.criteria.map((c, i) => ({
      name: c.name,
      score: 70 + i * 5,
      comment: `Cumple razonablemente este criterio según el entregable enviado.`,
    })),
    overallScore: 72,
    overallComment:
      "El joven entregó dentro del plazo y abordó el brief. La propuesta es funcional pero conservadora. Vale la pena conversar para validar profundidad y disposición a iterar.",
  };
}

function clamp(n: number, lo = 0, hi = 100): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export async function POST(req: NextRequest) {
  try {
    const { taskId, deliverable } = (await req.json()) as {
      taskId: string;
      deliverable: string;
    };
    if (!taskId || !deliverable?.trim()) {
      return NextResponse.json({ error: "taskId y deliverable son requeridos" }, { status: 400 });
    }

    const task = await getMicroTask(taskId);
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    if (task.status === "evaluated" || task.status === "paid") {
      return NextResponse.json({ error: "tarea ya evaluada" }, { status: 400 });
    }

    let aiEvaluation: NonNullable<MicroTask["aiEvaluation"]>;
    if (!hasGeminiKey()) {
      aiEvaluation = mockEvaluation(task);
    } else {
      try {
        const payload = {
          title: task.title,
          brief: task.brief,
          expectedDeliverable: task.expectedDeliverable,
          criteria: task.criteria,
          entregableDelJoven: deliverable,
        };
        const response = await gemini().models.generateContent({
          model: GEMINI_LITE_MODEL,
          contents: `${EVALUATE_PROMPT}\n\nMICRO-TAREA Y ENTREGABLE:\n${JSON.stringify(payload, null, 2)}`,
          config: { responseMimeType: "application/json", responseSchema },
        });
        const parsed = JSON.parse(response.text || "{}");
        const scores: CriterionScore[] = Array.isArray(parsed.criteriaScores)
          ? parsed.criteriaScores.map((s: CriterionScore) => ({
              name: String(s.name ?? ""),
              score: clamp(Number(s.score)),
              comment: String(s.comment ?? ""),
            }))
          : [];
        aiEvaluation = {
          criteriaScores: scores,
          overallScore: clamp(Number(parsed.overallScore)),
          overallComment: parsed.overallComment || "",
        };
      } catch (e) {
        if (isQuotaError(e)) {
          console.warn("[microtask/entregar] quota exhausted, falling back to mock");
          aiEvaluation = mockEvaluation(task);
        } else {
          throw e;
        }
      }
    }

    await updateMicroTask(taskId, {
      deliverable,
      deliveredAt: Date.now(),
      aiEvaluation,
      status: "delivered",
    });

    const updated = await getMicroTask(taskId);
    return NextResponse.json({ task: updated });
  } catch (err) {
    console.error("microtask/entregar error:", err);
    return NextResponse.json({ error: "No pudimos procesar el entregable." }, { status: 500 });
  }
}
