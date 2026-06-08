'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { isDemoProfile } from '@/lib/profile-source';
import type { Profile } from '@/lib/types';
import type { StorageMode } from '@/lib/db';

// --- Caché del perfil (stale-while-revalidate) ---
// Antes, cada vez que se navegaba a /joven/perfil/[id] se re-fetcheaba todo y
// se mostraba el spinner. Ahora cacheamos:
//   - en memoria (Map de módulo): instantáneo al re-entrar dentro de la sesión.
//   - en localStorage: sobrevive recargas (TTL 5 min).
// Se revalida en segundo plano. NO guardamos el embedding (vector pesado e
// inútil para la UI; solo sirve al matching server-side).
const PROFILE_CACHE_TTL = 5 * 60 * 1000;
type CachedProfileEntry = { profile: Profile; ts: number };
const profileMemCache = new Map<string, CachedProfileEntry>();

function profileCacheKey(id: string): string {
  return `salto_perfil_${id}`;
}
function readProfileLS(id: string): Profile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(profileCacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfileEntry;
    if (!parsed?.profile || Date.now() - parsed.ts >= PROFILE_CACHE_TTL) return null;
    profileMemCache.set(id, parsed);
    return parsed.profile;
  } catch {
    return null;
  }
}
function writeProfileCache(id: string, profile: Profile) {
  const slim: Profile = { ...profile, embedding: [] };
  const entry: CachedProfileEntry = { profile: slim, ts: Date.now() };
  profileMemCache.set(id, entry);
  try {
    localStorage.setItem(profileCacheKey(id), JSON.stringify(entry));
  } catch {
    /* cuota llena / privado: el Map de memoria igual cubre la sesión */
  }
}

/** key normalizado → { label original, cita } de skills extraídas de documentos. */
export type VerifiedSkillMap = Map<string, { label: string; evidence: string }>;

export interface ProfileContextValue {
  id: string;
  perfil: Profile;
  setPerfil: Dispatch<SetStateAction<Profile | null>>;
  storage: StorageMode | null;
  viewerIsEmpresa: boolean;
  viewerIsOwner: boolean;
  isDemo: boolean;
  verifiedSkills: VerifiedSkillMap;
  regenerating: boolean;
  handleRegenerate: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/** Datos del perfil compartidos por el layout y todas las páginas de módulo. */
export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile debe usarse dentro de <ProfileProvider>');
  return ctx;
}

/**
 * Carga el perfil UNA sola vez para todo el módulo "Mi Perfil" y lo expone por
 * contexto. Mientras carga muestra un loader; si falla, un estado de error.
 * Solo cuando hay perfil renderiza a los hijos (el chrome + la página activa),
 * así nadie tiene que lidiar con `perfil === null`.
 */
export function ProfileProvider({ id, children }: { id: string; children: ReactNode }) {
  // NO RoleGate: este perfil es contenido público de matching. Una empresa
  // logueada viene desde /empresa/matches/{needId} y debe ver al candidato.
  const router = useRouter();
  const { account, user } = useAuth();
  const viewerIsEmpresa = account?.role === 'empresa';
  const viewerIsOwner = !!user?.uid && user.uid === id;
  const isDemo = isDemoProfile(id);

  const [perfil, setPerfil] = useState<Profile | null>(() => profileMemCache.get(id)?.profile ?? null);
  const [storage, setStorage] = useState<StorageMode | null>(null);
  const [loading, setLoading] = useState(() => !profileMemCache.get(id));
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [verifiedSkills, setVerifiedSkills] = useState<VerifiedSkillMap>(new Map());

  // Re-genera el perfil desde la entrevista guardada con el motor actual.
  // Útil cuando mejora la extracción: el perfil guardado NO se actualiza solo.
  const handleRegenerate = async () => {
    if (regenerating) return;
    const transcript = perfil?.interviewTranscript;
    if (!transcript || transcript.length === 0) {
      setError('No encontramos tu entrevista guardada para actualizar el perfil.');
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch('/api/perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: transcript,
          basics: { name: perfil!.name, age: perfil!.age, gender: perfil!.gender },
          uid: user?.uid,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.profile) setPerfil(d.profile);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'No pudimos actualizar tu perfil. Intenta de nuevo.');
      }
    } catch {
      setError('Error de red al actualizar tu perfil.');
    } finally {
      setRegenerating(false);
    }
  };

  // Skills verificadas por documentos (diplomas/certificados): se marcan distinto.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/documentos?profileId=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const m: VerifiedSkillMap = new Map();
        for (const doc of json.documents ?? []) {
          for (const s of doc.extractedSkills ?? []) {
            const label = typeof s.skill === 'string' ? s.skill.trim() : '';
            const key = label.toLowerCase();
            if (key && !m.has(key)) m.set(key, { label, evidence: s.evidence ?? '' });
          }
        }
        setVerifiedSkills(m);
      } catch {
        /* silencio: la diferenciación es un extra, no debe romper el perfil */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    // Recarga "tibia": si no hay nada en memoria, intentamos localStorage para
    // pintar al instante mientras revalidamos en segundo plano.
    if (!profileMemCache.get(id)) {
      const ls = readProfileLS(id);
      if (ls) {
        setPerfil(ls);
        setStorage(id.startsWith('local_') ? 'memory' : 'firestore');
        setLoading(false);
      }
    }
    (async () => {
      try {
        const res = await fetch(`/api/perfil?id=${encodeURIComponent(id)}`);
        if (!res.ok) {
          const ownerOnUid = !!user?.uid && user.uid === id && account?.role === 'joven';
          if (ownerOnUid) {
            let storedId: string | null = null;
            try {
              storedId = localStorage.getItem('salto_last_profile_id');
            } catch {
              /* ignore */
            }
            if (storedId && storedId !== id) {
              const linkRes = await fetch('/api/perfil/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: id, sourceId: storedId }),
              });
              if (linkRes.ok) {
                try {
                  localStorage.setItem('salto_last_profile_id', id);
                } catch {
                  /* ignore */
                }
                if (!cancelled) router.replace(`/joven/perfil/${id}`);
                return;
              }
              if (!cancelled) router.replace(`/joven/perfil/${storedId}`);
              return;
            }
          }
          if (!cancelled) setError('Perfil no encontrado');
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setPerfil(data.profile);
          if (data.profile) writeProfileCache(id, data.profile);
          setStorage(data.storage ?? (id.startsWith('local_') ? 'memory' : 'firestore'));
          try {
            localStorage.setItem('salto_last_profile_id', id);
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (!cancelled) setError('Error cargando perfil');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user?.uid, account?.role, router]);

  // Mantener el caché sincronizado con cualquier cambio del perfil.
  useEffect(() => {
    if (perfil) writeProfileCache(id, perfil);
  }, [perfil, id]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 text-slate-500">
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="ml-2 text-sm">Cargando tu Perfil de Evidencia…</span>
        </div>
      </div>
    );
  }

  if (error || !perfil) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <h2 className="text-xl font-display font-medium mb-4">{error || 'Perfil no encontrado'}</h2>
        <Link href="/joven/chat">
          <Button>Volver a la entrevista</Button>
        </Link>
      </div>
    );
  }

  return (
    <ProfileContext.Provider
      value={{
        id,
        perfil,
        setPerfil,
        storage,
        viewerIsEmpresa,
        viewerIsOwner,
        isDemo,
        verifiedSkills,
        regenerating,
        handleRegenerate,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
