"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const LS_KEY = "salto_last_profile_id";

// Caché en memoria (por sesión) uid → profileId resuelto. Evita re-fetchear la
// resolución en cada montaje: al re-navegar dentro de la sesión es instantáneo
// (sin parpadeo de "aún no tenés perfil" mientras resuelve). Vacío en SSR y en
// el primer render tras recargar → sin riesgo de hydration mismatch.
const resolvedCache = new Map<string, string>();

/**
 * Id efectivo del perfil joven: uid de Firebase si tiene datos,
 * si no el último perfil en localStorage (p. ej. local_* antes de vincular).
 */
export function useJovenProfileId(): string | null {
  const { user, account } = useAuth();
  const [profileId, setProfileId] = useState<string | null>(() =>
    user?.uid && account?.role === "joven" ? resolvedCache.get(user.uid) ?? null : null
  );

  useEffect(() => {
    if (!user?.uid || account?.role !== "joven") {
      setProfileId(null);
      return;
    }

    // Semilla instantánea desde el caché de sesión.
    const cached = resolvedCache.get(user.uid);
    if (cached) {
      setProfileId(cached);
      return;
    }

    let cancelled = false;
    const remember = (id: string) => {
      resolvedCache.set(user.uid, id);
      if (!cancelled) setProfileId(id);
    };
    (async () => {
      const uid = user.uid;
      try {
        const uidRes = await fetch(`/api/perfil?id=${encodeURIComponent(uid)}`);
        if (uidRes.ok) {
          remember(uid);
          return;
        }

        let stored: string | null = null;
        try {
          stored = localStorage.getItem(LS_KEY);
        } catch {
          /* ignore */
        }

        if (stored && stored !== uid) {
          const storedRes = await fetch(`/api/perfil?id=${encodeURIComponent(stored)}`);
          if (storedRes.ok) {
            const linkRes = await fetch("/api/perfil/link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uid, sourceId: stored }),
            });
            if (linkRes.ok) {
              const linkData = await linkRes.json();
              const linkedId = linkData.id as string;
              try {
                localStorage.setItem(LS_KEY, linkedId);
              } catch {
                /* ignore */
              }
              remember(linkedId);
              return;
            }
            remember(stored);
            return;
          }
        }

        remember(uid);
      } catch {
        remember(user.uid);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, account?.role]);

  return profileId;
}
