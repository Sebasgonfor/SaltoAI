'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { CandidateDetail } from '@/components/empresa/candidate-detail';
import {
  readStoredMatchForNavigation,
  storeMatchForNavigation,
} from '@/lib/match-navigation-storage';
import type { Match } from '@/lib/types';

function CandidatoContent({ profileId }: { profileId: string }) {
  const searchParams = useSearchParams();
  const needId = searchParams.get('needId') ?? '';
  const { user } = useAuth();
  const [match, setMatch] = useState<Match | null>(() =>
    needId ? readStoredMatchForNavigation(needId, profileId) : null
  );

  useEffect(() => {
    if (!needId) return;
    const stored = readStoredMatchForNavigation(needId, profileId);
    if (stored) {
      setMatch(stored);
      return;
    }

    let cancelled = false;
    void fetch(`/api/match?needId=${encodeURIComponent(needId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const m = (data.matches as Match[] | undefined)?.find((x) => x.profileId === profileId);
        if (m) {
          storeMatchForNavigation(needId, profileId, m);
          setMatch(m);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needId, profileId]);

  // Sin needId (ej. abierto desde "Mis candidatos") igual mostramos el perfil
  // completo; solo se ocultan los elementos atados a una necesidad (score del
  // match, barra de decisión, proponer micro-tarea).
  if (!user?.uid) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center text-slate-600 text-sm">
        Inicia sesión como empresa para ver candidatos.
      </div>
    );
  }

  return (
    <CandidateDetail
      profileId={profileId}
      needId={needId}
      companyId={user.uid}
      match={match}
    />
  );
}

export default function EmpresaCandidatoPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = use(params);

  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-6 py-24 text-center text-slate-500 text-sm">
          Cargando…
        </div>
      }
    >
      <CandidatoContent profileId={profileId} />
    </Suspense>
  );
}
