import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { embed } from "@/lib/embeddings";
import { createNeed, getNeed } from "@/lib/db";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import { validateNeedDescription, validateCompanyName } from "@/lib/input-validation";
import { startLog } from "@/lib/logger";
import type { CompanyLegal, CompanyNeed } from "@/lib/types";

export const runtime = "nodejs";

const STRUCTURE_PROMPT = `Eres el estructurador de necesidades de SaltoAI.
Un founder de una empresa temprana describió en lenguaje libre qué necesita. Tu trabajo es estructurar eso en señales comparables para el motor de matching.

Reglas:
- role: 1 línea, claro, sin jerga corporativa. Ej: "Persona para atención al cliente y redes en local de comida."
- context: condiciones operativas reales (equipo pequeño, sin protocolos, ritmo rápido, multitarea, recursos limitados, etc.). Si el founder no describió contexto, deja un string vacío — NO inventes ritmo o cultura.
- requiredSkills: skills concretas que el rol exige. 3-6.
- desiredTraits: rasgos conductuales que el contexto exige. ADAPTALOS A LA NATURALEZA DEL ROL: para roles cuantitativos (vendedor, marketing) → "Orientación a resultados", "Tolerancia al caos", "Iniciativa". Para roles cualitativos (contador, cajero, diseñador, archivista) → "Detallista", "Confiable", "Sentido del orden", "Constancia". 2-5 rasgos.
- hardConstraints: restricciones duras y verificables (ubicación, disponibilidad horaria, idioma, edad mínima legal). 0-3. Si no hay, vacío.

- jobNature: clasifica el rol en una de TRES categorías. Esto cambia cómo el motor evalúa candidatos:
  * "cuantitativa": el valor del rol se mide en NÚMEROS (ventas, leads, crecimiento, conversión, NPS).
    Ejemplos: vendedor, growth, marketing, community manager, SDR, e-commerce, ventas B2B/B2C.
    En este caso, el motor PREMIA evidencia de resultados medibles del candidato.
  * "cualitativa": el valor del rol se mide en CONSISTENCIA, RIGOR Y CUIDADO. No se cuantifica en %.
    Ejemplos: contador / contabilidad de MIPYME, cajero, diseñador gráfico, archivista, asistente
    administrativo, operario, recepcionista, conserje, cocinero, costurero, mensajero confiable.
    Acá pedir "triplé las ventas" es absurdo — lo que importa es "cuadré caja todos los días sin un faltante",
    "diseñé X piezas con el tono que pidió el cliente", "manejé el archivo sin perder nada".
    En este caso, el motor NO debe castigar al candidato por no traer métricas; debe valorar
    confiabilidad, detalle, orden, consistencia.
  * "mixta": cuando puede ir hacia cualquier lado o el founder describió poco contexto.
    Ejemplos: atención al cliente puro, asistente general, redes sociales sin objetivo claro.
    Default cuando no estás seguro.

- jobNatureReason: 1 frase MAX de por qué clasificaste así. Útil para auditoría humana.
  Ej: "Cualitativa: rol contable en empresa pequeña, valor está en evitar errores no en métricas."

- NO inventes. Si el founder no mencionó algo, no lo agregues.
- Idioma: español natural neutro latinoamericano.`;

const schema = {
  type: Type.OBJECT,
  properties: {
    role: { type: Type.STRING },
    context: { type: Type.STRING },
    requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    desiredTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
    hardConstraints: { type: Type.ARRAY, items: { type: Type.STRING } },
    jobNature: { type: Type.STRING },
    jobNatureReason: { type: Type.STRING },
  },
  required: [
    "role",
    "context",
    "requiredSkills",
    "desiredTraits",
    "hardConstraints",
    "jobNature",
  ],
};

function normalizeJobNature(raw: unknown): "cuantitativa" | "cualitativa" | "mixta" {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (s === "cuantitativa") return "cuantitativa";
  if (s === "cualitativa") return "cualitativa";
  return "mixta";
}

function mockStructure(): Omit<CompanyNeed, "id" | "createdAt" | "embedding" | "companyName" | "rawDescription"> {
  return {
    role: "Persona para atender clientes y manejar redes en local de comida nuevo.",
    context: "Equipo de 3 personas, abriendo primer local, sin protocolos definidos, ritmo rápido y multitarea.",
    requiredSkills: ["Gestión de Redes Sociales", "Atención al Cliente", "Ventas B2C"],
    desiredTraits: ["Tolerancia al caos", "Proactividad", "Orientación a resultados"],
    hardConstraints: [],
    jobNature: "mixta",
    jobNatureReason: "Mock: clasificación neutra por defecto.",
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
    const { companyName, rawDescription, legal, ownerUid, ownerEmail, ownerName } =
      (await req.json()) as {
        companyName: string;
        rawDescription: string;
        legal?: CompanyLegal;
        ownerUid?: string;
        ownerEmail?: string | null;
        ownerName?: string | null;
      };
    if (!companyName?.trim() || !rawDescription?.trim()) {
      log.end({ status: 400, extra: { reason: "fields_required" } });
      return NextResponse.json(
        { error: "companyName y rawDescription requeridos", code: "fields_required" },
        { status: 400 }
      );
    }
    const companyNameErr = validateCompanyName(companyName);
    if (companyNameErr) {
      log.end({ status: 400, extra: { reason: "invalid_company_name" } });
      return NextResponse.json({ error: companyNameErr, code: "invalid_company_name" }, { status: 400 });
    }
    if (!ownerUid?.trim()) {
      log.end({ status: 400, extra: { reason: "owner_uid_required" } });
      return NextResponse.json({ error: "ownerUid requerido", code: "owner_uid_required" }, { status: 400 });
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
        jobNature: normalizeJobNature(parsed.jobNature),
        jobNatureReason:
          typeof parsed.jobNatureReason === "string" ? parsed.jobNatureReason : undefined,
      };

      // Edge case: el founder mandó texto pero no se pudo estructurar nada útil.
      if (structured.requiredSkills.length === 0 && structured.desiredTraits.length === 0) {
        log.warn("edge.empty_structure");
        log.end({ status: 422, extra: { code: "no_signals_extracted" } });
        return NextResponse.json(
          {
            error:
              "Tu descripción no tiene señales suficientes para construir el match. Cuenta qué hace la persona, el contexto del equipo y qué rasgos conductuales importan.",
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
      ...(legal && legal.acceptedTerms ? { legal } : {}),
      // Sin ownerUid la necesidad se guarda en Firestore pero NUNCA aparece
      // en el dashboard del founder (listNeedsByOwner filtra por uid). Era
      // el bug del usuario "no se guardó" — sí se guardaba, pero quedaba
      // huérfana y no la encontraba.
      ...(ownerUid ? { ownerUid } : {}),
      ...(ownerEmail ? { ownerEmail } : {}),
      ...(ownerName ? { ownerName } : {}),
    };

    const embedding = await embed(buildEmbeddingText(base));
    const { id, storage } = await createNeed({ ...base, embedding });
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
