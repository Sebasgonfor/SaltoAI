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
      // #region agent log
      fetch('http://127.0.0.1:7595/ingest/ff866a2f-ed10-444d-83df-559d155ce923',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'aa3c62'},body:JSON.stringify({sessionId:'aa3c62',hypothesisId:'B',location:'app/empresa/candidatos/page.tsx',message:'match_from_session',data:{needId,profileId,ics:stored.ics},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setMatch(stored);
      return;
    }

    let cancelled = false;
    const t0 = Date.now();
    // #region agent log
    fetch('http://127.0.0.1:7595/ingest/ff866a2f-ed10-444d-83df-559d155ce923',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'aa3c62'},body:JSON.stringify({sessionId:'aa3c62',hypothesisId:'B',location:'app/empresa/candidatos/page.tsx',message:'match_fetch_start',data:{needId,profileId,fallback:true},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    void fetch(`/api/match?needId=${encodeURIComponent(needId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const m = (data.matches as Match[] | undefined)?.find((x) => x.profileId === profileId);
        // #region agent log
        fetch('http://127.0.0.1:7595/ingest/ff866a2f-ed10-444d-83df-559d155ce923',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'aa3c62'},body:JSON.stringify({sessionId:'aa3c62',hypothesisId:'B',location:'app/empresa/candidatos/page.tsx',message:'match_fetch_done',data:{needId,profileId,ms:Date.now()-t0,found:!!m,cached:!!data.cached,fallback:true,matchCount:(data.matches as Match[]|undefined)?.length??0},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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
