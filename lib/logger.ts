/**
 * Structured JSON-line logger for API routes.
 *
 * One line per request, machine-parseable. Lets us answer "¿cómo monitorearían
 * esto en producción?" with a real demo (`tail -f` + jq filter on stdout).
 *
 * Usage:
 *   const log = startLog(req, "entrevista");
 *   // ... do work ...
 *   log.end({ status: 200, extra: { done: true } });
 */
import type { NextRequest } from "next/server";

export type LogLevel = "info" | "warn" | "error";

export interface LogPayload {
  ts: string;
  level: LogLevel;
  route: string;
  requestId: string;
  event: string;
  method?: string;
  status?: number;
  latencyMs?: number;
  message?: string;
  [k: string]: unknown;
}

function makeRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emit(payload: LogPayload) {
  // Single JSON line per event → grep-able, jq-able, ships cleanly to any
  // collector (Cloud Logging, Datadog, Loki) without a parser.
  const line = JSON.stringify(payload);
  if (payload.level === "error") console.error(line);
  else if (payload.level === "warn") console.warn(line);
  else console.log(line);
}

export interface RequestLogger {
  requestId: string;
  info: (event: string, extra?: Record<string, unknown>) => void;
  warn: (event: string, extra?: Record<string, unknown>) => void;
  error: (event: string, extra?: Record<string, unknown>) => void;
  end: (opts: { status: number; extra?: Record<string, unknown> }) => void;
}

export function startLog(req: NextRequest | Request | undefined, route: string): RequestLogger {
  const requestId = makeRequestId();
  const startedAt = Date.now();
  const method = req?.method;

  emit({
    ts: new Date().toISOString(),
    level: "info",
    route,
    requestId,
    event: "request.start",
    method,
  });

  const base = (level: LogLevel, event: string, extra?: Record<string, unknown>) =>
    emit({
      ts: new Date().toISOString(),
      level,
      route,
      requestId,
      event,
      method,
      ...(extra ?? {}),
    });

  return {
    requestId,
    info: (event, extra) => base("info", event, extra),
    warn: (event, extra) => base("warn", event, extra),
    error: (event, extra) => base("error", event, extra),
    end: ({ status, extra }) =>
      base(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "request.end", {
        status,
        latencyMs: Date.now() - startedAt,
        ...(extra ?? {}),
      }),
  };
}
