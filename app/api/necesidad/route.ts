import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { embed } from "@/lib/embeddings";
import { createNeed, getNeed } from "@/lib/db";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import { validateNeedDescription } from "@/lib/input-validation";
import { startLog } from "@/lib/logger";
import type { CompanyNeed } from "@/lib/types";

export const runtime = "nodejs";

const STRUCTURE_PROMPT = `Eres el estructurador de necesidades de Salto.
Un founder de una empresa temprana describió en lenguaje libre qué necesita. Tu trabajo es estructurar eso en señales comparables para el motor de matching.

Reglas:
- role: 1 línea, claro, sin jerga corporativa. Ej: "Persona para atención al cliente y redes en local de comida."
- context: condiciones operativas reales (equipo pequeño, sin protocolos, ritmo rápido, multitarea, recursos limitados, etc.). Si el founder no describió contexto, dejá un string vacío — NO inventes ritmo o cultura.
- requiredSkills: skills concretas que el rol exige. 3-6.
- desiredTraits: rasgos conductuales que el contexto exige (ej. tolerancia al caos, autodidactismo, orientación a resultados). 2-5.
- hardConstraints: restricciones duras y verificables (ubicación, disponibilidad horaria, idioma, edad mínima legal). 0-3. Si no hay, vacío.
- NO inventes. Si el founder no mencionó algo, no lo agregues.
- Idioma: español natural.`;

const schema = {
  type: Type.OBJECT,
  properties: {
    role: { type: Type.STRING },
    context: { type: Type.STRING },
    requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    desiredTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
    hardConstraints: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["role", "context", "requiredSkills", "desiredTraits", "hardConstraints"],
};

function mockStructure(): Omit<CompanyNeed, "id" | "createdAt" | "embedding" | "companyName" | "rawDescription"> {
  return {
    role: "Persona para atender clientes y manejar redes en local de comida nuevo.",
    context: "Equipo de 3 personas, abriendo primer local, sin protocolos definidos, ritmo rápido y multitarea.",
    requiredSkills: ["Gestión de Redes Sociales", "Atención al Cliente", "Ventas B2C"],
    desiredTraits: ["Tolerancia al caos", "Proactividad", "Orientación a resultados"],
    hardConstraints: [],
  };
}

function buildEmbeddingText(n: Omit<CompanyNeed, "id" | "createdAt" | "embedding">): string {
  return [
    n.role,
    "Contexto: " + n.context,
    "Habilidades requeridas: " + n.requiredSkills.join(", "),
    "Rasgos deseados: " + n.desiredTraits.join(", "),
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "necesidad");
  try {
    const { companyName, rawDescription } = (await req.json()) as {
      companyName: string;
      rawDescription: string;
    };
    if (!companyName?.trim() || !rawDescription?.trim()) {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        { error: "companyName y rawDescription requeridos", code: "fields_required" },
        { status: 400 }
      );
    }

    // §8.5: una necesidad sin contexto no se puede matchear honestamente.
    const validity = validateNeedDescription(rawDescription);
    if (!validity.ok) {
      log.warn("edge.thin_need", { reason: validity.reason });
      log.end({ status: 422, extra: { code: "insufficient_context", reason: validity.reason } });
      return NextResponse.json(
        { error: validity.message, code: "insufficient_context", reason: validity.reason },
        { status: 422 }
      );
    }

    let structured: ReturnType<typeof mockStructure>;
    if (!hasGeminiKey()) {
      structured = mockStructure();
      log.info("mode.mock_structure");
    } else {
      const response = await gemini().models.generateContent({
        model: GEMINI_MODEL,
        contents: `${STRUCTURE_PROMPT}\n\nNombre empresa: ${companyName}\nDescripción libre del founder:\n${rawDescription}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      const parsed = JSON.parse(response.text || "{}");
      structured = {
        role: parsed.role || "Rol no especificado",
        context: parsed.context || "",
        requiredSkills: Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills : [],
        desiredTraits: Array.isArray(parsed.desiredTraits) ? parsed.desiredTraits : [],
        hardConstraints: Array.isArray(parsed.hardConstraints) ? parsed.hardConstraints : [],
      };

      // Edge case: el founder mandó texto pero no se pudo estructurar nada útil.
      if (structured.requiredSkills.length === 0 && structured.desiredTraits.length === 0) {
        log.warn("edge.empty_structure");
        log.end({ status: 422, extra: { code: "no_signals_extracted" } });
        return NextResponse.json(
          {
            error:
              "Tu descripción no tiene señales suficientes para construir el match. Contá qué hace la persona, el contexto del equipo y qué rasgos conductuales importan.",
            code: "no_signals_extracted",
          },
          { status: 422 }
        );
      }
    }

    const base = {
      companyName: companyName.trim(),
      rawDescription: rawDescription.trim(),
      ...structured,
    };

    const embedding = await embed(buildEmbeddingText(base));
    const id = await createNeed({ ...base, embedding });
    const saved = await getNeed(id);
    log.end({
      status: 200,
      extra: {
        needId: id,
        requiredSkills: structured.requiredSkills.length,
        desiredTraits: structured.desiredTraits.length,
        hardConstraints: structured.hardConstraints.length,
      },
    });
    return NextResponse.json({ id, need: saved });
  } catch (err) {
    if (isRateLimitError(err)) {
      const shape = classifyProviderError(err);
      log.warn("rate_limited", { message: (err as Error)?.message });
      log.end({ status: shape.status, extra: { code: shape.code } });
      return errorResponse(shape);
    }
    log.error("necesidad.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos estructurar la necesidad.", code: "unknown" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "necesidad");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    log.end({ status: 400, extra: { reason: "id_required" } });
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const n = await getNeed(id);
  if (!n) {
    log.end({ status: 404, extra: { needId: id } });
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  log.end({ status: 200, extra: { needId: id } });
  return NextResponse.json({ need: n });
}
