import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { embed } from "@/lib/embeddings";
import {
  createProfile,
  getProfile,
  upsertProfileWithId,
  storageFromId,
  getRecruiterConfig,
  getRecruiterConfigBySlug,
} from "@/lib/db";
import { normalizeSlug, toPromptConfig, type PromptConfig } from "@/lib/recruiter-config";
import { parseProfileContact } from "@/lib/profile-contact";
import { classifyProviderError, errorResponse, isRateLimitError } from "@/lib/api-errors";
import { validateForProfileExtraction } from "@/lib/input-validation";
import { sanitizeEvidenceForCv } from "@/lib/cv-evidence";
import { filterRealSkills } from "@/lib/skill-classification";
import {
  heuristicExtraction,
  isProfileTooThin,
  mergeProfiles,
} from "@/lib/heuristic-profile";
import { startLog } from "@/lib/logger";
import type { ChatMessage, JovenBasics, Profile, ProfileContact, WorkEntry } from "@/lib/types";

export const runtime = "nodejs";

function parseBasics(raw: unknown): JovenBasics | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length < 2) return null;
  return { name };
}

const EXTRACTION_PROMPT = `Eres el extractor de Perfil de Evidencia de SaltoAI.
A partir de la transcripción de la entrevista, extrae SOLO lo que el joven dijo, con evidencia citada.

Reglas estrictas (anti-alucinación):
- Cada skill DEBE estar anclada a un hecho REAL que el joven mencionó. Si no hay sustento en la transcripción, NO la incluyas.
- NO inventes números, fechas ni resultados. Si el joven no los mencionó, no aparecen.

VENDER EL TALENTO (redacción, NO invención):
- NUNCA copies la frase del joven palabra por palabra. Tu trabajo es REESCRIBIR lo que dijo a lenguaje
  profesional que "venda" la competencia ante un reclutador — sin inventar hechos ni cifras.
- Si el joven solo se autodescribió ("soy bueno en ventas", "sé de reclutamiento"), conviértelo en una
  competencia concreta usando el contexto que haya dado; si no dio contexto, redáctala como capacidad
  profesional clara, nunca como cita literal de su autodescripción.
- Usa verbos de acción y enfoque de impacto/resultado SOLO con lo que realmente ocurrió.

Formato de evidencia (sección "Experiencia y logros" del CV — VOZ PROFESIONAL IMPERSONAL):
- Cada entrada tiene "skill" (competencia con nombre de mercado laboral) + "quote" (la capacidad demostrada, con su contexto o resultado).
- El "quote" se escribe en VOZ IMPERSONAL: SIN pronombres ("yo", "él", "ella") y SIN narrar en tercera persona pasado.
  PROHIBIDO empezar con "Aprendió/Mejoró/Resolvió/Triplicó…" o contar una anécdota. Describe la COMPETENCIA que la
  persona aporta, anclada a lo que realmente hizo. Frases tipo:
  · "Aprendizaje autónomo de herramientas y procesos en entornos sin onboarding formal."
  · "Organización y documentación de flujos de trabajo para mayor claridad del equipo."
  · "Atención al cliente: manejo de reclamos con respuesta rápida y trato directo."
- Prioriza COMPETENCIA + (resultado o contexto). El reclutador debe entender de qué es capaz la persona.
- Traduce contexto informal a lenguaje laboral neutro ("local de su tía" → "comercio familiar"). Sin modismos ni muletillas.
- PROHIBIDO lenguaje que reste profesionalismo o que sea contexto personal negativo: NUNCA menciones regaños, llamados de
  atención, despidos, conflictos, errores personales ni emociones ("me regañaron", "tras un regaño", "me equivoqué").
  Tradúcelo a la competencia profesional resultante (p. ej. "mejora del desempeño a partir de feedback").
- PROHIBIDO mencionar SaltoAI, "IA", la entrevista, el chat o que el CV/perfil fue generado por una herramienta:
  el CV debe leerse como un CV profesional normal.
- Omite detalles que no aporten valor laboral. Si el relato es vago o solo actitud sin hecho concreto, NO lo incluyas.
- Conserva cifras, plazos y métricas SOLO si el joven las mencionó. NO inventes números.
- Cada quote: 1 oración, máximo 2. Sin repetir el nombre de la skill al inicio.
- PROHIBIDO meta-evidencia ("Contó que...", "Dijo que...", "Mencionó...").

Otros campos:
- skills: nombra TODAS las habilidades concretas que el relato justifique (normalmente 4-10, sin
  tope rígido — cuantas más demuestre el joven, mejor). NO te limites a una lista fija de competencias:
  nombra la habilidad REAL que demuestra cada hecho que contó, con su nombre estándar de mercado laboral
  (ej. "Gestión de Inventario", "Edición de Video", "Manejo de Caja", "Cobranza", "Atención al Cliente",
  "Gestión de Redes Sociales", "Ventas B2C"). Una skill por competencia distinta, sin descripciones largas
  y sin inventar habilidades que no tengan sustento en la transcripción.
- traits: 2-5 rasgos conductuales observados, no juicios. Buenos: "Tolerancia al caos", "Autodidacta",
  "Orientación a resultados". Malos: "Buena persona", "Trabajador", "Dedicado".
- summary: 2-3 frases de RESUMEN PROFESIONAL en voz IMPERSONAL — SIN el nombre como sujeto, SIN "es un joven que…",
  SIN tercera persona narrativa. Enfócate en sus capacidades y a qué puede aportar.
  Ej: "Desarrollador full-stack autodidacta con capacidad de aprendizaje autónomo, organización de procesos y mejora continua."
- name: si la persona dijo su nombre, úsalo; si no, "Candidato/a".
- workHistory: SOLO empleos/roles formales o semiformales que la persona mencione explícitamente (cargo, y si lo dijo: organización, periodo, una frase de logro/responsabilidad). NO inventes empleos ni fechas. Si no mencionó trabajos formales, devuelve [].
- tools: herramientas o tecnologías concretas que mencione dominar (ej. "Excel", "Power BI", "Figma", "Canva", "Photoshop", "ATS", "Notion"). Solo las que dijo. Si ninguna, [].
- languages: idiomas que mencione, con nivel si lo dio (ej. "Inglés (B2)", "Portugués (básico)"). NO asumas idiomas; solo los que dijo. Si ninguno, [].

Idioma de salida: español neutro latinoamericano.
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
    workHistory: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING },
          organization: { type: Type.STRING },
          period: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["role"],
      },
    },
    tools: { type: Type.ARRAY, items: { type: Type.STRING } },
    languages: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["name", "summary", "skills", "traits", "evidence"],
};

/**
 * Extracción mock SOLO cuando hay transcript real pero no hay Gemini key.
 */
function mockExtraction(
  basics: JovenBasics,
  _transcript: string
): Omit<Profile, "id" | "createdAt" | "embedding"> {
  return {
    name: basics.name,
    summary:
      "Perfil generado en modo demo (sin clave de IA). Las habilidades y rasgos se infirieron con heurística simple sobre la conversación.",
    skills: ["Comunicación", "Iniciativa"],
    traits: ["Proactividad"],
    evidence: [
      {
        skill: "Iniciativa",
        quote: "Identificó oportunidades de mejora en la conversación y aportó ejemplos concretos de su trayectoria.",
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
    ...(p.workHistory?.length
      ? ["Experiencia: " + p.workHistory.map((w) => [w.role, w.organization].filter(Boolean).join(" en ")).join(" | ")]
      : []),
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const log = startLog(req, "perfil");
  try {
    const body = (await req.json()) as {
      messages: ChatMessage[];
      basics?: unknown;
      uid?: string;
      displayName?: string;
      sourceRecruiterUid?: string;
      sourceRecruiterSlug?: string;
    };
    const { messages, basics: basicsRaw, uid } = body;
    // Asociación candidato ↔ reclutadora (si llegó por un link /r/[slug]).
    const sourceRecruiterSlug =
      typeof body.sourceRecruiterSlug === "string" && body.sourceRecruiterSlug.trim()
        ? normalizeSlug(body.sourceRecruiterSlug) || undefined
        : undefined;
    // El uid de la reclutadora puede llegar explícito, o lo resolvemos desde el
    // slug (la landing pública nunca expone el uid al cliente). Resolverlo aquí
    // server-side garantiza la asociación sin filtrar el uid.
    let sourceRecruiterUid =
      typeof body.sourceRecruiterUid === "string" && body.sourceRecruiterUid.trim()
        ? body.sourceRecruiterUid.trim().slice(0, 128)
        : undefined;
    // Resolvemos la config de la reclutadora (si la hay) tanto para asociar el
    // perfil como para sesgar el TONO/IDIOMA del summary. Aditivo: sin config,
    // el extractor se comporta igual que hoy.
    let recruiterCfg: PromptConfig | undefined;
    if (sourceRecruiterUid) {
      const rc = await getRecruiterConfig(sourceRecruiterUid);
      if (rc) recruiterCfg = toPromptConfig(rc);
    }
    if (!recruiterCfg && sourceRecruiterSlug) {
      const rc = await getRecruiterConfigBySlug(sourceRecruiterSlug);
      if (rc) {
        if (!sourceRecruiterUid) sourceRecruiterUid = rc.recruiterUid;
        recruiterCfg = toPromptConfig(rc);
      }
    }
    const basics = parseBasics(basicsRaw);
    if (!basics) {
      log.end({ status: 400, extra: { reason: "invalid_basics" } });
      return NextResponse.json(
        { error: "Completa nombre, edad y género antes de generar el perfil." },
        { status: 400 }
      );
    }
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
    let extractionMode: "llm" | "llm+heuristic" | "heuristic_only" | "mock" = "llm";
    // Capturados por el LLM (no van al body base; workHistory va al perfil,
    // tools/languages al contact para el CV). Solo lo que la persona dijo.
    let capturedWorkHistory: WorkEntry[] = [];
    let capturedTools: string[] = [];
    let capturedLanguages: string[] = [];

    // Piso heurístico — se computa siempre. Usa regex sobre el transcript
    // para producir 2-5 skills/evidencias ancladas a citas reales. Es nuestra
    // red de seguridad para que el perfil NUNCA salga vacío.
    const heuristic = heuristicExtraction(messages, { name: basics.name });

    if (!hasGeminiKey()) {
      // Sin LLM, usamos heurístico real (más rico que el mock canónico).
      extracted = {
        name: basics.name,
        ...heuristic,
      };
      extractionMode = "heuristic_only";
      log.info("mode.heuristic_extraction");
    } else {
      let llmBody = { summary: "", skills: [] as string[], traits: [] as string[], evidence: [] as { skill: string; quote: string }[] };
      try {
        // Personalización SOLO del campo summary (tono/idioma de la
        // reclutadora). El resto del schema y las reglas anti-alucinación NO
        // cambian. Sin config → string vacío → extracción idéntica a hoy.
        const summaryHint = (() => {
          if (!recruiterCfg) return "";
          const parts: string[] = [];
          if (recruiterCfg.personaDescriptor) {
            parts.push(
              `redacta el campo "summary" imitando este tono y calidez (sin inventar datos): ${recruiterCfg.personaDescriptor}`
            );
          }
          if (recruiterCfg.language === "en") {
            parts.push('escribe el campo "summary" en INGLÉS');
          }
          if (!parts.length) return "";
          return `\n\nPERSONALIZACIÓN (solo afecta el campo summary, nada más): ${parts.join("; ")}.`;
        })();
        const response = await gemini().models.generateContent({
          model: GEMINI_MODEL,
          contents: `${EXTRACTION_PROMPT}${summaryHint}\n\nDato confirmado por la persona (NO cambiar el nombre): nombre="${basics.name}".\n\nTranscripción:\n${transcript}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        });
        const parsed = JSON.parse(response.text || "{}");
        llmBody = {
          summary: parsed.summary || "",
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
          traits: Array.isArray(parsed.traits) ? parsed.traits : [],
          evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        };
        capturedWorkHistory = Array.isArray(parsed.workHistory)
          ? (parsed.workHistory as WorkEntry[])
              .filter((w) => w && typeof w.role === "string" && w.role.trim())
              .map((w) => ({
                role: String(w.role).trim(),
                organization: w.organization?.toString().trim() || undefined,
                period: w.period?.toString().trim() || undefined,
                description: w.description?.toString().trim() || undefined,
              }))
              .slice(0, 8)
          : [];
        const cleanList = (raw: unknown): string[] =>
          Array.isArray(raw)
            ? [...new Set(
                (raw as unknown[])
                  .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                  .map((x) => x.trim()),
              )].slice(0, 12)
            : [];
        capturedTools = cleanList(parsed.tools);
        capturedLanguages = cleanList(parsed.languages);
      } catch (llmErr) {
        // Si el LLM cae aquí (timeout, JSON mal formado, etc.) y NO es rate
        // limit, seguimos con heurístico — la entrevista no muere. Los rate
        // limits sí se propagan al catch externo para mostrar Retry-After.
        if (isRateLimitError(llmErr)) throw llmErr;
        log.warn("perfil.llm_failed_falling_back", {
          message: (llmErr as Error)?.message,
        });
      }

      // Decisión de fusión:
      //   LLM rico  → usar LLM solo (mejor narrativa).
      //   LLM pobre → fusionar con heurístico para garantizar piso.
      //   LLM vacío → heurístico puro.
      if (isProfileTooThin(llmBody)) {
        const merged = isProfileTooThin({ skills: llmBody.skills, evidence: llmBody.evidence })
          ? mergeProfiles(llmBody, heuristic)
          : llmBody;
        extracted = {
          name: basics.name,
          ...merged,
        };
        extractionMode = llmBody.skills.length === 0 && llmBody.evidence.length === 0
          ? "heuristic_only"
          : "llm+heuristic";
        log.info("perfil.thin_llm_reinforced_with_heuristic", {
          llmSkills: llmBody.skills.length,
          llmEvidence: llmBody.evidence.length,
        });
      } else {
        extracted = {
          name: basics.name,
          ...llmBody,
        };
        extractionMode = "llm";
      }
    }

    extracted = {
      ...extracted,
      evidence: sanitizeEvidenceForCv(extracted.evidence),
      ...(capturedWorkHistory.length > 0 && { workHistory: capturedWorkHistory }),
    };

    if (extracted.skills.length === 0 && extracted.evidence.length > 0) {
      extracted.skills = [...new Set(extracted.evidence.map((e) => e.skill))];
    }

    // Carrera/título/cargo ≠ habilidad: "Ingeniería Industrial" no es una skill.
    // Se filtra acá (antes del piso heurístico) para que, si queda vacío, caiga
    // al fallback en vez de mostrar una carrera como habilidad.
    extracted.skills = filterRealSkills(extracted.skills);

    // Último piso: si tras la sanitización quedó vacío, usamos el heurístico
    // crudo. El perfil NUNCA debe salir sin skills/evidencias.
    if (extracted.evidence.length === 0 || extracted.skills.length === 0) {
      log.warn("edge.empty_after_sanitize_fallback_to_heuristic");
      extracted = {
        ...extracted,
        skills: heuristic.skills,
        traits: extracted.traits.length > 0 ? extracted.traits : heuristic.traits,
        evidence: heuristic.evidence,
        summary: extracted.summary?.trim() || heuristic.summary,
      };
      extractionMode = "heuristic_only";
    }

    const embedding = await embed(buildEmbeddingText(extracted));

    let id: string;
    let storage: "firestore" | "memory";
    // Sanitización del transcript: solo guardamos role + content (sin
    // timestamps, sin metadata adicional). Strings vacíos descartados.
    const interviewTranscript = Array.isArray(messages)
      ? messages
          .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content }))
      : undefined;

    // Herramientas / idiomas detectados en la entrevista → contact (para el CV).
    const capturedContact: Partial<ProfileContact> = {};
    if (capturedTools.length > 0) capturedContact.tools = capturedTools.join(", ");
    if (capturedLanguages.length > 0) capturedContact.languages = capturedLanguages.join(", ");

    // Mezcla con el contact existente SIN pisar lo que el usuario ya editó a mano
    // (también preserva el contact al re-extraer; setDoc reemplaza el documento).
    const mergeContact = (base?: ProfileContact): ProfileContact | undefined => {
      const out: ProfileContact = { ...base };
      for (const [k, v] of Object.entries(capturedContact)) {
        if (v && !(out as Record<string, unknown>)[k]) {
          (out as Record<string, string>)[k] = v;
        }
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };

    if (uid) {
      const existing = await getProfile(uid);
      const mergedContact = mergeContact(existing?.contact);
      await upsertProfileWithId(uid, {
        ...extracted,
        embedding,
        createdAt: existing?.createdAt ?? Date.now(),
        // NO preservamos `latent`: se deriva de la evidencia/skills, así que al
        // re-extraer (entrevista nueva o re-procesada) el talento latente viejo
        // queda STALE — puede hablar de otra persona/historia (bug real: un
        // perfil heredó el latent de otro vía link y al re-entrevistar siguió
        // mostrándolo). Al dejarlo fuera, /api/talento-latente lo regenera
        // desde la evidencia actual en la próxima visita a Potencial.
        taskStats: existing?.taskStats,
        ...(mergedContact && { contact: mergedContact }),
        ...(interviewTranscript && { interviewTranscript }),
        // Conservar asociación previa si ya existía; si llega una nueva, prevalece.
        ...((sourceRecruiterUid ?? existing?.sourceRecruiterUid) && {
          sourceRecruiterUid: sourceRecruiterUid ?? existing?.sourceRecruiterUid,
        }),
        ...((sourceRecruiterSlug ?? existing?.sourceRecruiterSlug) && {
          sourceRecruiterSlug: sourceRecruiterSlug ?? existing?.sourceRecruiterSlug,
        }),
      });
      id = uid;
      storage = storageFromId(uid);
    } else {
      const newContact = mergeContact(undefined);
      const created = await createProfile({
        ...extracted,
        embedding,
        ...(newContact && { contact: newContact }),
        ...(interviewTranscript && { interviewTranscript }),
        ...(sourceRecruiterUid && { sourceRecruiterUid }),
        ...(sourceRecruiterSlug && { sourceRecruiterSlug }),
      });
      id = created.id;
      storage = created.storage;
    }

    const saved = await getProfile(id);
    log.end({
      status: 200,
      extra: {
        profileId: id,
        skills: extracted.skills.length,
        traits: extracted.traits.length,
        evidence: extracted.evidence.length,
        storage,
        extractionMode,
      },
    });
    return NextResponse.json({ id, profile: saved, storage, extractionMode });
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

export async function PATCH(req: NextRequest) {
  const log = startLog(req, "perfil");
  try {
    const body = (await req.json()) as {
      id?: string;
      uid?: string;
      basics?: unknown;
      contact?: unknown;
      skills?: unknown;
      traits?: unknown;
      evidence?: unknown;
      summary?: unknown;
    };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    const basics = body.basics != null ? parseBasics(body.basics) : null;
    const contact =
      body.contact != null ? parseProfileContact(body.contact) : null;
    const hasContent =
      body.skills != null ||
      body.traits != null ||
      body.evidence != null ||
      body.summary != null;

    if (!id || !uid || id !== uid) {
      log.end({ status: 403, extra: { reason: "forbidden" } });
      return NextResponse.json({ error: "No autorizado para editar este perfil." }, { status: 403 });
    }
    if (!basics && !contact && !hasContent) {
      log.end({ status: 400, extra: { reason: "nothing_to_update" } });
      return NextResponse.json(
        { error: "Indica datos para actualizar." },
        { status: 400 }
      );
    }
    if (body.basics != null && !basics) {
      log.end({ status: 400, extra: { reason: "invalid_basics" } });
      return NextResponse.json(
        { error: "Completa nombre, edad y género válidos." },
        { status: 400 }
      );
    }
    if (body.contact != null && !contact) {
      log.end({ status: 400, extra: { reason: "invalid_contact" } });
      return NextResponse.json(
        { error: "Datos de contacto inválidos o vacíos." },
        { status: 400 }
      );
    }

    const existing = await getProfile(id);
    if (!existing) {
      log.end({ status: 404, extra: { profileId: id } });
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const patch: Profile = { ...existing };
    if (basics) {
      patch.name = basics.name;
    }
    if (contact) {
      patch.contact = { ...existing.contact, ...contact };
    }

    // Edición de contenido: listas saneadas (trim, sin vacíos, deduplicadas, capadas).
    const cleanStrList = (raw: unknown, maxLen: number, maxItems: number): string[] => {
      if (!Array.isArray(raw)) return [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const x of raw) {
        if (typeof x !== "string") continue;
        const v = x.trim().slice(0, maxLen);
        const key = v.toLowerCase();
        if (v && !seen.has(key)) {
          seen.add(key);
          out.push(v);
        }
        if (out.length >= maxItems) break;
      }
      return out;
    };
    let contentChanged = false;
    if (body.skills != null) {
      patch.skills = cleanStrList(body.skills, 60, 20);
      contentChanged = true;
    }
    if (body.traits != null) {
      patch.traits = cleanStrList(body.traits, 60, 10);
      contentChanged = true;
    }
    if (body.evidence != null && Array.isArray(body.evidence)) {
      const items = body.evidence
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((e) => ({
          skill: typeof e.skill === "string" ? e.skill.trim() : "",
          quote: typeof e.quote === "string" ? e.quote.trim() : "",
        }))
        .filter((e) => e.skill && e.quote);
      patch.evidence = sanitizeEvidenceForCv(items);
      contentChanged = true;
    }
    if (typeof body.summary === "string") {
      patch.summary = body.summary.trim().slice(0, 800);
      contentChanged = true;
    }
    // Si cambió el contenido que alimenta el matching, re-embebemos. Si falla
    // (sin clave / cuota), conservamos el embedding previo para no romper el guardado.
    if (contentChanged) {
      try {
        patch.embedding = await embed(buildEmbeddingText(patch));
      } catch (e) {
        log.warn("perfil.patch.reembed_failed", { message: (e as Error)?.message });
      }
    }

    await upsertProfileWithId(id, patch);

    const saved = await getProfile(id);
    const mode = hasContent ? "patch_content" : basics && contact ? "patch_both" : basics ? "patch_basics" : "patch_contact";
    log.end({ status: 200, extra: { profileId: id, mode } });
    return NextResponse.json({ profile: saved, storage: storageFromId(id) });
  } catch (err) {
    log.error("perfil.patch.exception", { message: (err as Error)?.message });
    log.end({ status: 500, extra: { code: "unknown" } });
    return NextResponse.json(
      { error: "No pudimos guardar los cambios.", code: "unknown" },
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
  return NextResponse.json({ profile: p, storage: storageFromId(id) });
}
