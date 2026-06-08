"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Caché cliente stale-while-revalidate reutilizable.
 *
 * Antes, cada página client-side re-fetcheaba al montar y mostraba spinner al
 * navegar (Inicio ↔ Perfil ↔ Tareas). Este hook:
 *   - Semilla el estado desde un caché en MEMORIA (Map de módulo): instantáneo
 *     al re-navegar dentro de la sesión. Vacío en SSR y en el primer render del
 *     cliente → sin riesgo de hydration mismatch.
 *   - Persiste en localStorage (TTL) para sobrevivir recargas.
 *   - Revalida en segundo plano y actualiza si cambió.
 *
 * El `key` debe identificar el recurso (p. ej. `dash_<uid>`). Si es `null`, el
 * hook no carga (útil mientras auth resuelve).
 */
const DEFAULT_TTL = 5 * 60 * 1000;
// Ventana de "dedupe": si el caché es más nuevo que esto, NO revalidamos en
// segundo plano al montar. Evita que cada entrada a una página (p. ej. volver a
// Inicio) dispare otra ronda de fetches cuando los datos son casi recién
// traídos. Pasada la ventana, sí revalida (stale-while-revalidate normal).
const DEFAULT_REVALIDATE_AFTER = 30 * 1000;
type Entry = { data: unknown; ts: number };
const mem = new Map<string, Entry>();

/** Edad (ms) de la entrada en memoria, o null si no existe. */
function memAge(key: string | null): number | null {
  if (!key) return null;
  const e = mem.get(key);
  return e ? Date.now() - e.ts : null;
}

function lsKey(k: string): string {
  return `salto_cache_${k}`;
}
function fresh(e: Entry | undefined, ttl: number): boolean {
  return !!e && Date.now() - e.ts < ttl;
}
function readMem<T>(key: string | null, ttl: number): T | null {
  if (!key) return null;
  const e = mem.get(key);
  return fresh(e, ttl) ? (e!.data as T) : null;
}
function readLS<T>(key: string, ttl: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry;
    if (!fresh(e, ttl)) return null;
    mem.set(key, e);
    return e.data as T;
  } catch {
    return null;
  }
}
function writeCache<T>(key: string, data: T) {
  const e: Entry = { data, ts: Date.now() };
  mem.set(key, e);
  try {
    localStorage.setItem(lsKey(key), JSON.stringify(e));
  } catch {
    /* cuota/privado: el Map de memoria cubre la sesión */
  }
}

/** Lectura puntual del caché (memoria → localStorage). `null` si no hay o venció. */
export function getCachedResource<T>(key: string, ttlMs: number = DEFAULT_TTL): T | null {
  return readMem<T>(key, ttlMs) ?? readLS<T>(key, ttlMs);
}

/** Escritura puntual del caché (memoria + localStorage). */
export function setCachedResource<T>(key: string, data: T): void {
  writeCache(key, data);
}

export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL,
  revalidateAfterMs: number = DEFAULT_REVALIDATE_AFTER
): {
  data: T | null;
  loading: boolean;
  setData: (d: T) => void;
  refresh: () => Promise<void>;
} {
  // Mantener el fetcher en un ref para no re-disparar por su identidad (suele
  // ser una arrow inline). Solo `key` controla la recarga.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setDataState] = useState<T | null>(() => readMem<T>(key, ttlMs));
  const [loading, setLoading] = useState<boolean>(() => !!key && readMem(key, ttlMs) == null);

  const setData = useCallback(
    (d: T) => {
      setDataState(d);
      if (key) writeCache(key, d);
    },
    [key]
  );

  const refresh = useCallback(async () => {
    if (!key) {
      setLoading(false);
      return;
    }
    try {
      const d = await fetcherRef.current();
      setDataState(d);
      writeCache(key, d);
    } catch {
      /* conserva lo cacheado */
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!key) {
      setLoading(false);
      return;
    }
    const m = readMem<T>(key, ttlMs);
    if (m != null) {
      setDataState(m);
      setLoading(false);
    } else {
      const ls = readLS<T>(key, ttlMs);
      if (ls != null) {
        setDataState(ls);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    // Revalida solo si NO hay un caché reciente (dentro de la ventana de
    // dedupe). Volver a entrar a la página a los pocos segundos no re-dispara
    // los fetches; pasada la ventana, sí se refresca en segundo plano.
    const age = memAge(key);
    if (age == null || age >= revalidateAfterMs) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, setData, refresh };
}
