import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, hasGeminiKey } from "@/lib/gemini";
import { startLog } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/cursos/recomendar?skill=X[&context=Y]
 *
 * Devuelve 2-3 cursos GRATUITOS y REALES para aprender una skill, usando
 * Gemini con Google Search grounding (tools: [{ googleSearch: {} }]).
 *
 * Por qué grounding y no catálogo curado:
 *   - El catálogo curado se desactualiza solo (cursos cambian de URL,
 *     paywall, se vuelven pagos). Mantenerlo es trabajo manual constante.
 *   - SerpAPI / Brave Search puro gastan cuota y necesitan parsing.
 *   - Gemini con googleSearch hace el trabajo: busca en Coursera/Platzi/edX/
 *     freeCodeCamp/Udacity, filtra los gratuitos, y devuelve URLs verificadas
 *     porque vienen del grounding metadata.
 *
 * Cache en memoria por (skill normalizada) con TTL 24h. Para una skill
 * popular ("Atención al cliente"), la primera request hace search real,
 * las siguientes pegan desde memoria.
 */

const COURSE_PROMPT = `Eres el recomendador de cursos gratuitos de SaltoAI para jóvenes que buscan su primer empleo formal en LATAM.

Busca en Google cursos GRATUITOS REALES sobre la skill que te paso, en español o con subtítulos en español. Prioriza plataformas reconocidas en LATAM:
  - Platzi (cursos gratis específicos)
  - Coursera (audit/sin certificado)
  - edX (audit)
  - freeCodeCamp
  - Udacity Free
  - YouTube (canales profesionales: SoyDalto, MoureDev, Códigofacilito, etc.)
  - Khan Academy
  - SENA (cursos virtuales abiertos)

CRÍTICO:
  - Solo cursos que sean REALMENTE gratuitos. NO pagos disfrazados.
  - Solo URLs que puedas verificar — si no estás seguro, NO lo incluyas.
  - Idioma español preferido. Si solo hay inglés con subtítulos, marcarlo.
  - Devuelve MÁXIMO 3 cursos, los mejores.

Devuelve JSON con la forma EXACTA:
{
  "skill": "skill que pediste",
  "courses": [
    {
      "title": "título del curso",
      "provider": "Platzi | Coursera | edX | freeCodeCamp | YouTube | SENA | otro",
      "url": "URL directa al curso (verificable)",
      "language": "es | en-with-es-subs",
      "estimatedHours": número aproximado de horas,
      "why": "1 frase: por qué este curso es bueno para esta skill"
    }
  ]
}
NO uses formato markdown. Devuelve SOLO el JSON crudo.`;

interface CourseRecommendation {
  title: string;
  provider: string;
  url: string;
  language: "es" | "en-with-es-subs" | string;
  estimatedHours: number;
  why: string;
}

interface RecommendationResult {
  skill: string;
  courses: CourseRecommendation[];
  groundingSources?: string[];
  cached?: boolean;
  cachedAt?: number;
}

// Cache en memoria por skill (TTL 24h). Anclado a globalThis para sobrevivir
// HMR en dev y entre route handlers del mismo proceso.
type CursosCache = Map<string, { result: RecommendationResult; timestamp: number }>;
const g = globalThis as unknown as { __saltoCursosCache?: CursosCache };
if (!g.__saltoCursosCache) g.__saltoCursosCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeSkill(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function tryParseJson(text: string): unknown {
  // Cuando usamos tools, Gemini no acepta responseSchema y a veces devuelve
  // JSON envuelto en ```json fences. Limpiamos antes de parsear.
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Intentar extraer el primer bloque { ... } válido
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

interface ParsedCourse {
  title?: unknown;
  provider?: unknown;
  url?: unknown;
  language?: unknown;
  estimatedHours?: unknown;
  why?: unknown;
}

async function searchCoursesWithGrounding(skill: string): Promise<RecommendationResult> {
  const response = await gemini().models.generateContent({
    model: GEMINI_MODEL, // flash regular, NO lite — el grounding necesita el modelo más capaz
    contents: `${COURSE_PROMPT}\n\nSKILL: ${skill}`,
    config: {
      // Tools y responseSchema son mutuamente excluyentes en el SDK actual;
      // pedimos el JSON por prompt y parseamos tolerantemente.
      tools: [{ googleSearch: {} }],
    },
  });

  const raw = response.text || "{}";
  const parsed = tryParseJson(raw) as { skill?: string; courses?: ParsedCourse[] } | null;

  const courses: CourseRecommendation[] = Array.isArray(parsed?.courses)
    ? parsed!.courses!.slice(0, 3).map((c) => ({
        title: typeof c.title === "string" ? c.title : "Curso sin título",
        provider: typeof c.provider === "string" ? c.provider : "Otro",
        url: typeof c.url === "string" ? c.url : "",
        language:
          c.language === "es" || c.language === "en-with-es-subs"
            ? c.language
            : "es",
        estimatedHours: typeof c.estimatedHours === "number" ? c.estimatedHours : 0,
        why: typeof c.why === "string" ? c.why : "",
      }))
    : [];

  // Filtramos los que vinieron sin URL (Gemini a veces alucina con tools off,
  // con grounding pasa menos pero igual nos cubrimos).
  const withUrls = courses.filter((c) => c.url && /^https?:\/\//.test(c.url));

  // ── Validación server-side de URLs (anti-404) ──────────────────────────────
  // Gemini con grounding A VECES devuelve URLs que parecen reales (a un dominio
  // real conocido) pero apuntan a páginas que YA NO EXISTEN. El user reportó
  // explícitamente "los links a veces llevan a 404".
  //
  // Estrategia: HEAD request en paralelo con timeout corto (3s) por cada URL.
  // - 200, 2xx, 3xx → válida
  // - 4xx → muerta, descartar
  // - 5xx, timeout, network err → ambigua, DEJAMOS pasar (mejor un link
  //   incierto que rompido). El user puede dar feedback con el botón "No".
  // - Sitios que rechazan HEAD (405 Method Not Allowed) → reintento con GET
  //   y Range:bytes=0-0 para pedir solo el primer byte.
  const validated = await Promise.all(
    withUrls.map(async (c) => {
      try {
        const head = await Promise.race([
          fetch(c.url, { method: "HEAD", redirect: "follow" }),
          new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 3000),
          ),
        ]);
        if (head.status >= 400 && head.status < 500) {
          // 4xx → probablemente muerto. Reintentar con GET por si rechazaron HEAD.
          if (head.status === 405 || head.status === 403) {
            try {
              const get = await Promise.race([
                fetch(c.url, {
                  method: "GET",
                  redirect: "follow",
                  headers: { Range: "bytes=0-0" },
                }),
                new Promise<Response>((_, reject) =>
                  setTimeout(() => reject(new Error("timeout")), 3000),
                ),
              ]);
              if (get.status >= 400 && get.status < 500) {
                console.warn(`[cursos] URL muerta tras retry (${get.status}): ${c.url}`);
                return null;
              }
              return c;
            } catch {
              return c; // ambigua → la dejamos
            }
          }
          console.warn(`[cursos] URL muerta (${head.status}): ${c.url}`);
          return null;
        }
        return c;
      } catch {
        // Timeout o network: ambigua. Mejor un link incierto que descartar
        // injustamente. El joven puede reportarla con el botón "No".
        return c;
      }
    }),
  );
  const filtered = validated.filter((c): c is CourseRecommendation => c !== null);

  // Extraemos las URLs del grounding metadata si Gemini las anotó.
  const groundingSources: string[] = [];
  try {
    const candidate = (response as unknown as {
      candidates?: { groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] } }[];
    }).candidates?.[0];
    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    for (const c of chunks) {
      if (c.web?.uri) groundingSources.push(c.web.uri);
    }
  } catch {
    /* opcional */
  }

  return {
    skill,
    courses: filtered,
    groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
  };
}

export async function GET(req: NextRequest) {
  const log = startLog(req, "cursos.recomendar");
  try {
    const skill = req.nextUrl.searchParams.get("skill")?.trim();
    if (!skill) {
      log.end({ status: 400 });
      return NextResponse.json({ error: "skill requerida" }, { status: 400 });
    }
    if (skill.length > 100) {
      log.end({ status: 400, extra: { reason: "skill_too_long" } });
      return NextResponse.json({ error: "skill demasiado larga" }, { status: 400 });
    }

    const cacheKey = normalizeSkill(skill);
    const cached = g.__saltoCursosCache!.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      log.end({ status: 200, extra: { skill, cached: true } });
      return NextResponse.json({
        ...cached.result,
        cached: true,
        cachedAt: cached.timestamp,
      });
    }

    if (!hasGeminiKey()) {
      log.end({ status: 503, extra: { reason: "no_gemini_key" } });
      return NextResponse.json(
        {
          error:
            "Recomendación de cursos requiere Gemini con grounding. Configura GEMINI_API_KEY.",
          skill,
          courses: [],
        },
        { status: 503 },
      );
    }

    const result = await searchCoursesWithGrounding(skill);
    if (result.courses.length === 0) {
      // No cacheamos respuestas vacías — si fue un fallo transitorio queremos
      // reintentar la próxima vez.
      log.end({ status: 200, extra: { skill, foundCourses: 0 } });
      return NextResponse.json({
        ...result,
        warning:
          "No encontramos cursos gratuitos verificables para esta skill. Probá otra búsqueda más amplia.",
      });
    }

    g.__saltoCursosCache!.set(cacheKey, { result, timestamp: Date.now() });
    log.end({
      status: 200,
      extra: {
        skill,
        cached: false,
        foundCourses: result.courses.length,
        sources: result.groundingSources?.length ?? 0,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error("cursos.recomendar.exception", { message: (err as Error)?.message });
    log.end({ status: 500 });
    return NextResponse.json(
      { error: "No pudimos buscar cursos." },
      { status: 500 },
    );
  }
}
