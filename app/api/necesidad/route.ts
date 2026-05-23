import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { embed } from "@/lib/embeddings";
import { createNeed, getNeed } from "@/lib/db";
import type { CompanyNeed } from "@/lib/types";

export const runtime = "nodejs";

const STRUCTURE_PROMPT = `Eres el estructurador de necesidades de Salto.
Un founder de una empresa temprana describió en lenguaje libre qué necesita. Tu trabajo es estructurar eso en señales comparables para el motor de matching.

Reglas:
- role: 1 línea, claro, sin jerga corporativa. Ej: "Persona para atención al cliente y redes en local de comida."
- context: condiciones operativas reales (equipo pequeño, sin protocolos, ritmo rápido, multitarea, recursos limitados, etc.).
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
  try {
    const { companyName, rawDescription } = (await req.json()) as {
      companyName: string;
      rawDescription: string;
    };
    if (!companyName?.trim() || !rawDescription?.trim()) {
      return NextResponse.json(
        { error: "companyName y rawDescription requeridos" },
        { status: 400 }
      );
    }

    let structured: ReturnType<typeof mockStructure>;
    if (!hasGeminiKey()) {
      structured = mockStructure();
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
    }

    const base = {
      companyName: companyName.trim(),
      rawDescription: rawDescription.trim(),
      ...structured,
    };

    const embedding = await embed(buildEmbeddingText(base));
    const { id, storage } = await createNeed({ ...base, embedding });
    const saved = await getNeed(id);
    return NextResponse.json({ id, need: saved, storage });
  } catch (err) {
    console.error("necesidad error:", err);
    return NextResponse.json({ error: "No pudimos estructurar la necesidad." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const n = await getNeed(id);
  if (!n) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ need: n });
}
