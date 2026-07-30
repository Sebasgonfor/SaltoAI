import { EMBED_MODEL, gemini, hasGeminiKey } from "./gemini";

const EMBED_DIM = 768;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mockEmbedding(text: string): number[] {
  const seed = hashString(text.toLowerCase());
  const v = new Array(EMBED_DIM);
  let x = seed || 1;
  for (let i = 0; i < EMBED_DIM; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    v[i] = (x / 0xffffffff) * 2 - 1;
  }
  return normalize(v);
}

function normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

export async function embed(text: string): Promise<number[]> {
  if (!hasGeminiKey()) return mockEmbedding(text);
  try {
    const res: any = await gemini().models.embedContent({
      model: EMBED_MODEL,
      contents: text,
    });
    const values: number[] | undefined =
      res?.embeddings?.[0]?.values ?? res?.embedding?.values;
    if (!values || !values.length) return mockEmbedding(text);
    return normalize(values);
  } catch (e) {
    console.error("embed() failed, using mock:", e);
    return mockEmbedding(text);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
