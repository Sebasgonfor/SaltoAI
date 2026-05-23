import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = "gemini-2.5-flash";
export const EMBED_MODEL = "gemini-embedding-001";

export function hasGeminiKey(): boolean {
  const k = process.env.GEMINI_API_KEY;
  return !!k && k !== "MY_GEMINI_API_KEY" && k.length > 10;
}

let _client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _client;
}
