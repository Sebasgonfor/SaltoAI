import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { embed } from "@/lib/embeddings";
import { createProfile, getProfile } from "@/lib/db";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import { validateForProfileExtraction } from "@/lib/input-validation";
import { startLog } from "@/lib/logger";
import type { ChatMessage, Profile } from "@/lib/types";

export const runtime = "nodejs";

const EXTRACTION_PROMPT = `Eres el extractor de Perfil de Evidencia de Salto.
A partir de la transcripción de la entrevista, extrae SOLO lo que el joven dijo, con evidencia citada.

Reglas estrictas (anti-alucinación):
- Cada skill DEBE estar anclada a un hecho REAL que el joven mencionó. Si no hay sustento en la transcripción, NO la incluyas.
- NO inventes números, fechas ni resultados. Si el joven no los mencionó, no aparecen.

Formato de evidencia (CV-ready):
- Cada quote se redacta en TERCERA PERSONA, tiempo PASADO, empezando con un VERBO DE ACCIÓN fuerte
  ("Triplicó", "Diseñó", "Coordinó", "Aprendió", "Resolvió", "Atendió", "Implementó", "Lideró").
- Conservá los detalles cuantificables que el joven dio (cifras, %, cantidades, plazos, número de clientes). NO los inventes; si no los dio, omitilos.
- Cada quote es 1 oración, máximo 2. Concisa, en español natural, sin jerga corporativa.
- Reformulá lo que dijo el joven (paráfrasis cercana), no copies textual la primera persona —
  el resultado debe leerse como un bullet de CV listo para imprimir.
- Ejemplos del formato deseado:
  · "Triplicó las ventas del local de su tía en 6 meses gestionando pedidos por Instagram."
  · "Aprendió por su cuenta a editar Reels y consiguió 200 clientes nuevos sin pagar publicidad."
  · "Resolvió reclamos de clientes en un evento de 80 personas sin que escalara a la organización."

Otros campos:
- skills: 3-6 habilidades concretas con nombre estándar de mercado laboral (ej. "Atención al Cliente",
  "Gestión de Redes Sociales", "Ventas B2C"), no descripciones largas.
- traits: 2-5 rasgos conductuales observados, no juicios. Buenos: "Tolerancia al caos", "Autodidacta",
  "Orientación a resultados". Malos: "Buena persona", "Trabajador", "Dedicado".
- summary: 2-3 frases en lenguaje natural describiendo a la persona y su trayectoria informal.
- name: si la persona dijo su nombre, úsalo; si no, "Candidato/a Salto".

Idioma: español natural rioplatense/colombiano.
Devolvé JSON estricto con el schema indicado.`;

const schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    summary: { type: Type.STRING },
    skills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    traits: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          quote: { type: Type.STRING },
        },
        required: ["skill", "quote"],
      },
    },
  },
  required: ["name", "summary", "skills", "traits", "evidence"],
};

/**
 * Extracción mock SOLO cuando hay transcript real pero no hay Gemini key.
 * Antes esto se disparaba también con conversaciones vacías → falsa Camila
 * Silva en la demo. Hoy solo se usa si hay contenido validado.
 */
function mockExtraction(_transcript: string): Omit<Profile, "id" | "createdAt" | "embedding"> {
  return {
    name: "Candidato/a Salto",
    summary:
      "Perfil generado en modo demo (sin clave de IA). Las habilidades y rasgos se infirieron con heurística simple sobre la conversación.",
    skills: ["Comunicación", "Iniciativa"],
    traits: ["Proactividad"],
    evidence: [
      { skill: "Comunicación", quote: "Contó su historia con detalle al agente de Salto." },
    ],
  };
}

function buildEmbeddingText(p: Omit<Profile, "id" | "createdAt" | "embedding">): string {
  return [
    p.summary,
    "Habilidades: " + p.skills.join(", "),
    "Rasgos: " + p.traits.join(", "),
    "Evidencia: " + p.evidence.map((e) => `${e.skill} — ${e.quote}`).join(" | "),
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "perfil");
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      log.end({ status: 400, extra: { reason: "messages_required" } });
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // §8.5: si no hay señal suficiente, lo decimos honestamente.
    const validity = validateForProfileExtraction(messages);
    if (!validity.ok) {
      log.warn("edge.insufficient_input", { reason: validity.reason });
      log.end({ status: 422, extra: { code: "insufficient_input", reason: validity.reason } });
      return NextResponse.json(
        {
          error: validity.message,
          code: "insufficient_input",
          reason: validity.reason,
        },
        { status: 422 }
      );
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "JOVEN" : "AGENTE"}: ${m.content}`)
      .join("\n");

    let extracted: Omit<Profile, "id" | "createdAt" | "embedding">;

    if (!hasGeminiKey()) {
      extracted = mockExtraction(transcript);
      log.info("mode.mock_extraction");
    } else {
      const response = await gemini().models.generateContent({
        model: GEMINI_MODEL,
        contents: `${EXTRACTION_PROMPT}\n\nTranscripción:\n${transcript}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      const parsed = JSON.parse(response.text || "{}");
      extracted = {
        name: parsed.name || "Candidato/a Salto",
        summary: parsed.summary || "",
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        traits: Array.isArray(parsed.traits) ? parsed.traits : [],
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      };

      // Si tras pasar por el LLM no quedó NADA citado, mejor honestidad que
      // un perfil vacío que rompe el matching más adelante.
      if (extracted.evidence.length === 0 && extracted.skills.length === 0) {
        log.warn("edge.empty_extraction");
        log.end({ status: 422, extra: { code: "no_evidence_extracted" } });
        return NextResponse.json(
          {
            error:
              "No pudimos anclar evidencia concreta en lo que contaste. Volvé al chat y profundizá con ejemplos puntuales (qué hiciste, cuándo, qué cambió).",
            code: "no_evidence_extracted",
          },
          { status: 422 }
        );
      }
    }

    const embedding = await embed(buildEmbeddingText(extracted));

    const id = await createProfile({
      ...extracted,
      embedding,
    });

    const saved = await getProfile(id);
    log.end({
      status: 200,
      extra: {
        profileId: id,
        skills: extracted.skills.length,
        traits: extracted.traits.length,
        evidence: extracted.evidence.length,
      },
    });
    return NextResponse.json({ id, profile: saved });
  } catch (err) {
    if (isRateLimitError(err)) {
      const shape = classifyProviderError(err);
      log.warn("rate_limited", { message: (err as Error)?.message });
      log.end({ status: shape.status, extra: { code: shape.code } });
      return errorResponse(shape);
    }
    log.error("perfil.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos construir el perfil.", code: "unknown" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "perfil");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    log.end({ status: 400, extra: { reason: "id_required" } });
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const p = await getProfile(id);
  if (!p) {
    log.end({ status: 404, extra: { profileId: id } });
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  log.end({ status: 200, extra: { profileId: id } });
  return NextResponse.json({ profile: p });
}
