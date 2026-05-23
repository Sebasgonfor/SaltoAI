/**
 * Mapeo de errores de Gemini / red a respuestas honestas para el usuario.
 *
 * El free tier de Gemini es 5 req/min. Sin esto, un 429 del provider se
 * traduce en un 500 opaco para el joven. Con esto, el joven ve
 * "estamos a tope, intentá en 30 segundos" y el founder no abandona.
 */
import { NextResponse } from "next/server";

export interface ApiErrorShape {
  status: number;
  code: string;
  error: string;
  retryAfterSec?: number;
}

interface MaybeApiError {
  status?: number;
  code?: number | string;
  statusCode?: number;
  message?: string;
  cause?: unknown;
  response?: { status?: number; headers?: { get?: (k: string) => string | null } };
}

function readStatus(e: MaybeApiError): number | undefined {
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  if (typeof e.code === "number") return e.code;
  if (typeof e.code === "string" && /^\d+$/.test(e.code)) return parseInt(e.code, 10);
  if (e.response?.status) return e.response.status;
  // Gemini SDK formatea: "[GoogleGenerativeAI Error]: 429 Too Many Requests"
  const m = e.message?.match(/\b(4\d\d|5\d\d)\b/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

function readRetryAfter(e: MaybeApiError): number | undefined {
  const headerVal = e.response?.headers?.get?.("retry-after");
  if (headerVal) {
    const n = parseInt(headerVal, 10);
    if (!Number.isNaN(n)) return n;
  }
  // Gemini suele incluir "retryDelay":"30s" en el cuerpo del 429
  const m = e.message?.match(/retryDelay["':\s]+(\d+)s/i);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

export function isRateLimitError(err: unknown): boolean {
  const e = (err ?? {}) as MaybeApiError;
  const status = readStatus(e);
  if (status === 429) return true;
  return /\b(429|RESOURCE_EXHAUSTED|quota|rate ?limit|too many requests)\b/i.test(
    e.message ?? ""
  );
}

export function classifyProviderError(err: unknown): ApiErrorShape {
  const e = (err ?? {}) as MaybeApiError;
  if (isRateLimitError(err)) {
    const retry = readRetryAfter(e) ?? 30;
    return {
      status: 429,
      code: "rate_limited",
      error: `Nuestro motor de IA está a tope ahora mismo. Probá de nuevo en ${retry} segundos.`,
      retryAfterSec: retry,
    };
  }
  const status = readStatus(e) ?? 500;
  if (status >= 500) {
    return {
      status: 503,
      code: "ai_provider_unavailable",
      error: "El motor de IA no respondió. Reintentá en unos segundos.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      status,
      code: "ai_bad_request",
      error: "No pudimos procesar la entrada. Reformulá con más detalle.",
    };
  }
  return {
    status: 500,
    code: "unknown",
    error: "Algo salió mal. Reintentá.",
  };
}

/**
 * Devuelve una NextResponse con el shape de error mapeado, e incluye
 * Retry-After si corresponde — el cliente puede usarlo para countdown.
 */
export function errorResponse(shape: ApiErrorShape, extra?: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  if (shape.retryAfterSec) headers["Retry-After"] = String(shape.retryAfterSec);
  return NextResponse.json(
    { error: shape.error, code: shape.code, retryAfterSec: shape.retryAfterSec, ...(extra ?? {}) },
    { status: shape.status, headers }
  );
}
