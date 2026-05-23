import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { embed } from "@/lib/embeddings";
import { createProfile, getProfile, storageFromId } from "@/lib/db";
import type { ChatMessage, Gender, JovenBasics, Profile } from "@/lib/types";

const VALID_GENDERS: Gender[] = ["mujer", "hombre", "otro", "prefiero_no_decir"];

function parseBasics(raw: unknown): JovenBasics | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const age = typeof b.age === "number" ? b.age : Number(b.age);
  const gender = b.gender as Gender;
  if (!name || name.length < 2) return null;
  if (!Number.isFinite(age) || age < 16 || age > 35) return null;
  if (!VALID_GENDERS.includes(gender)) return null;
  return { name, age: Math.round(age), gender };
}

export const runtime = "nodejs";

const EXTRACTION_PROMPT = `Eres el extractor de Perfil de Evidencia de Salto.
A partir de la transcripción de la entrevista, extrae SOLO lo que el joven dijo, con evidencia citada.

Reglas estrictas:
- Cada skill DEBE estar anclada a una cita textual (o cuasi-textual) del joven.
- Si una skill no tiene evidencia clara en la transcripción, NO la incluyas.
- Los rasgos (traits) son patrones de comportamiento observados, no juicios genéricos. Ejemplos buenos: "Tolerancia al caos", "Autodidacta", "Orientación a resultados". Ejemplos malos: "Buena persona", "Trabajador".
- summary: 1-2 frases que describan a la persona en lenguaje natural, no corporativo.
- Si la persona dijo su nombre, úsalo. Si no, deja "Candidato/a Salto".
- Idioma: español natural.

Devuelve JSON estricto con el schema indicado.`;

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

function mockExtraction(
  basics: JovenBasics,
  _transcript: string
): Omit<Profile, "id" | "createdAt" | "embedding"> {
  return {
    name: basics.name,
    age: basics.age,
    gender: basics.gender,
    summary:
      "Joven con experiencia informal manejando redes sociales y atención al cliente en un negocio familiar. Aprende sola y resuelve sin que nadie le diga.",
    skills: ["Gestión de Redes Sociales", "Ventas B2C", "Atención al Cliente"],
    traits: ["Tolerancia al caos", "Autodidacta", "Orientación a resultados"],
    evidence: [
      { skill: "Ventas B2C", quote: "Triplicó las ventas del negocio de su tía en 6 meses." },
      {
        skill: "Gestión de Redes Sociales",
        quote: "Manejó el Instagram sin experiencia previa y consiguió 200 clientes nuevos.",
      },
      {
        skill: "Atención al Cliente",
        quote: "Respondía mensajes y reclamos directamente, sin protocolo.",
      },
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
  try {
    const body = (await req.json()) as { messages: ChatMessage[]; basics?: unknown };
    const { messages, basics: basicsRaw } = body;
    const basics = parseBasics(basicsRaw);
    if (!basics) {
      return NextResponse.json(
        { error: "Completa nombre, edad (16-35) y género antes de generar el perfil." },
        { status: 400 }
      );
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "JOVEN" : "AGENTE"}: ${m.content}`)
      .join("\n");

    let extracted: Omit<Profile, "id" | "createdAt" | "embedding">;

    if (!hasGeminiKey()) {
      extracted = mockExtraction(basics, transcript);
    } else {
      const response = await gemini().models.generateContent({
        model: GEMINI_MODEL,
        contents: `${EXTRACTION_PROMPT}\n\nDatos confirmados por la persona (NO cambiar nombre, edad ni género): nombre="${basics.name}", edad=${basics.age}, género=${basics.gender}.\n\nTranscripción:\n${transcript}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      const parsed = JSON.parse(response.text || "{}");
      extracted = {
        name: basics.name,
        age: basics.age,
        gender: basics.gender,
        summary: parsed.summary || "",
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        traits: Array.isArray(parsed.traits) ? parsed.traits : [],
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      };
    }

    const embedding = await embed(buildEmbeddingText(extracted));

    const { id, storage } = await createProfile({
      ...extracted,
      embedding,
    });

    const saved = await getProfile(id);
    return NextResponse.json({ id, profile: saved, storage });
  } catch (err) {
    console.error("perfil error:", err);
    return NextResponse.json({ error: "No pudimos construir el perfil." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const p = await getProfile(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ profile: p, storage: storageFromId(id) });
}
