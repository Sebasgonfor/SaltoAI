'use client';

import { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
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

  if (!needId) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <h2 className="text-xl font-display font-medium mb-2">Falta la búsqueda</h2>
        <p className="text-sm text-slate-600 mb-6">
          Abre al candidato desde la lista de matches para ver el detalle completo.
        </p>
        <Link href="/empresa">
          <Button>Ir a mis necesidades</Button>
        </Link>
      </div>
    );
  }

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
