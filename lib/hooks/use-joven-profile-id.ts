"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const LS_KEY = "salto_last_profile_id";

/**
 * Id efectivo del perfil joven: uid de Firebase si tiene datos,
 * si no el último perfil en localStorage (p. ej. local_* antes de vincular).
 */
export function useJovenProfileId(): string | null {
  const { user, account } = useAuth();
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || account?.role !== "joven") {
      setProfileId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const uid = user.uid;
      try {
        const uidRes = await fetch(`/api/perfil?id=${encodeURIComponent(uid)}`);
        if (uidRes.ok) {
          if (!cancelled) setProfileId(uid);
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
              if (!cancelled) setProfileId(linkedId);
              return;
            }
            if (!cancelled) setProfileId(stored);
            return;
          }
        }

        if (!cancelled) setProfileId(uid);
      } catch {
        if (!cancelled) setProfileId(user.uid);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, account?.role]);

  return profileId;
}
