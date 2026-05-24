import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_LITE_MODEL, hasGeminiKey, isQuotaError } from "@/lib/gemini";
import { getProfile, updateProfileLatent } from "@/lib/db";
import type { LatentProfile } from "@/lib/types";

export const runtime = "nodejs";

const LATENT_PROMPT = `Eres el Detector de Talento Latente de Salto.
Recibes un Perfil de Evidencia ya extraído (skills, traits, evidence citada). Tu trabajo es revelar lo que el joven HIZO pero NO sabe que tiene valor de mercado.

Reglas:
- hiddenSkills: skills concretas que se derivan de la evidencia pero el joven NO nombró. Cada una con:
  · name: nombre que usa el mercado laboral (no jerga corporativa, español natural)
  · derivedFrom: cita textual o paráfrasis breve de la evidencia que lo sustenta
  · marketContext: 1 frase de por qué las empresas pagan por esto
  · confidence: low | medium | high según fuerza de la evidencia
- transversalSkills: capacidades transversales (no técnicas específicas) reveladas por el comportamiento, máximo 3. Cada una con name + derivedFrom.
- suggestedRoles: 3 tipos de rol donde encaja, ordenados por mejor fit. Cada uno con:
  · roleTitle: título realista para LATAM (ej. "Asistente de operaciones de tienda" no "Operations Junior Specialist")
  · whyFits: 2 frases citando evidencia concreta del perfil
  · readinessHint: 1 frase honesta sobre qué le falta o qué tiene que practicar para ganar la entrevista de ese rol
- closingMessage: 2 frases dirigidas al joven en SEGUNDA PERSONA, cercano, no condescendiente. Empieza con algo concreto que descubriste de él.

CRÍTICO:
- NO inventes skills no respaldadas por la evidencia.
- NO repitas skills ya listadas en el perfil. El objetivo es REVELAR, no enumerar.
- Si la evidencia es muy pobre, devuelve hiddenSkills vacío y un closingMessage honesto ("aún no tenemos suficiente para revelar más, cuéntanos más").
- Idioma: español natural, registro LATAM.`;

const hiddenSkillSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    derivedFrom: { type: Type.STRING },
    marketContext: { type: Type.STRING },
    confidence: { type: Type.STRING },
  },
  required: ["name", "derivedFrom", "marketContext", "confidence"],
};

const transversalSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    derivedFrom: { type: Type.STRING },
  },
  required: ["name", "derivedFrom"],
};

const roleSchema = {
  type: Type.OBJECT,
  properties: {
    roleTitle: { type: Type.STRING },
    whyFits: { type: Type.STRING },
    readinessHint: { type: Type.STRING },
  },
  required: ["roleTitle", "whyFits", "readinessHint"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    hiddenSkills: { type: Type.ARRAY, items: hiddenSkillSchema },
    transversalSkills: { type: Type.ARRAY, items: transversalSchema },
    suggestedRoles: { type: Type.ARRAY, items: roleSchema },
    closingMessage: { type: Type.STRING },
  },
  required: ["hiddenSkills", "transversalSkills", "suggestedRoles", "closingMessage"],
};

function mockLatent(): LatentProfile {
  return {
    hiddenSkills: [
      {
        name: "Operación de tienda y control de stock informal",
        derivedFrom: "Manejaba pedidos por Instagram y respondía sin protocolo",
        marketContext: "Las empresas pagan por personas que sostienen operación caótica sin que se les caigan los detalles.",
        confidence: "high",
      },
      {
        name: "Copywriting comercial básico para redes",
        derivedFrom: "Llevó el Instagram del negocio y consiguió 200 clientes nuevos sin pagar publicidad",
        marketContext: "Marcas pequeñas pagan por contenido que vende sin sonar a anuncio.",
        confidence: "medium",
      },
    ],
    transversalSkills: [
      { name: "Tolerancia ambigüedad", derivedFrom: "Resolvía reclamos sin tener un protocolo definido" },
      { name: "Pensamiento de dueño", derivedFrom: "Triplicó ventas sin que nadie le pidiera ese resultado" },
    ],
    suggestedRoles: [
      {
        roleTitle: "Asistente de operaciones en local pequeño",
        whyFits: "Ya operaste un local informal con clientes reales. Sabes que se cae un proveedor y hay que resolver en 10 minutos.",
        readinessHint: "Te conviene practicar cómo contar 1-2 logros concretos con cifras antes de la entrevista.",
      },
      {
        roleTitle: "Community manager junior para emprendimientos",
        whyFits: "Hiciste crecer una cuenta de negocio sin presupuesto. Eso es exactamente lo que buscan los founders en etapa cero.",
        readinessHint: "Anota tus métricas reales: cuántos seguidores tenías al empezar, cuántos al terminar.",
      },
      {
        roleTitle: "Atención al cliente para startups de servicios",
        whyFits: "Atendiste reclamos a toda hora sin guion. Eso es soft skill puro, no se enseña en universidades.",
        readinessHint: "Prepara 1 historia donde un cliente complicado terminó comprando o agradeciendo.",
      },
    ],
    closingMessage:
      "Lo que hiciste en el negocio de tu tía no es 'experiencia familiar' — es operación, copywriting y CS junior real. Las startups pagan por eso, aunque no aparezca en un CV tradicional.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const { profileId } = (await req.json()) as { profileId: string };
    if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

    const profile = await getProfile(profileId);
    if (!profile) return NextResponse.json({ error: "profile not found" }, { status: 404 });

    // Idempotente: si ya tiene latent, devolverlo sin recalcular (ahorra cuota)
    if (profile.latent && profile.latent.hiddenSkills?.length > 0) {
      return NextResponse.json({ profileId, latent: profile.latent, cached: true });
    }

    let latent: LatentProfile;
    let degraded = false;
    if (!hasGeminiKey()) {
      latent = mockLatent();
      degraded = true;
    } else {
      try {
        const payload = {
          name: profile.name,
          summary: profile.summary,
          skills: profile.skills,
          traits: profile.traits,
          evidence: profile.evidence,
        };
        const response = await gemini().models.generateContent({
          model: GEMINI_LITE_MODEL,
          contents: `${LATENT_PROMPT}\n\nPERFIL DE EVIDENCIA:\n${JSON.stringify(payload, null, 2)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });
        const parsed = JSON.parse(response.text || "{}");
        latent = {
          hiddenSkills: Array.isArray(parsed.hiddenSkills) ? parsed.hiddenSkills : [],
          transversalSkills: Array.isArray(parsed.transversalSkills) ? parsed.transversalSkills : [],
          suggestedRoles: Array.isArray(parsed.suggestedRoles) ? parsed.suggestedRoles : [],
          closingMessage: parsed.closingMessage || "",
        };
      } catch (e) {
        if (isQuotaError(e)) {
          console.warn("[talento-latente] quota exhausted, falling back to mock");
          latent = mockLatent();
          degraded = true;
        } else {
          throw e;
        }
      }
    }

    await updateProfileLatent(profileId, latent);
    return NextResponse.json({ profileId, latent, degraded });
  } catch (err) {
    console.error("talento-latente error:", err);
    return NextResponse.json({ error: "No pudimos detectar talento latente." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("profileId");
  if (!id) return NextResponse.json({ error: "profileId required" }, { status: 400 });
  const profile = await getProfile(id);
  if (!profile) return NextResponse.json({ error: "profile not found" }, { status: 404 });
  return NextResponse.json({ profileId: id, latent: profile.latent ?? null });
}
