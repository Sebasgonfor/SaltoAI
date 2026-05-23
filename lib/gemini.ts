import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_LITE_MODEL = "gemini-2.5-flash-lite";
export const EMBED_MODEL = "gemini-embedding-001";

export function hasGeminiKey(): boolean {
  const k = process.env.GEMINI_API_KEY;
  return !!k && k !== "MY_GEMINI_API_KEY" && k.length > 10;
}

export function isQuotaError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e?.status === 429) return true;
  const msg = e?.message || "";
  return /RESOURCE_EXHAUSTED|quota|429/i.test(String(msg));
}

let _client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _client;
}
