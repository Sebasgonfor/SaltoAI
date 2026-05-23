'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Building2,
  Sparkles,
  AlertCircle,
  Network,
  MessageSquareQuote,
} from 'lucide-react';
import type { Gender, OpportunityMatch, Profile } from '@/lib/types';

const GENDER_LABEL: Record<Gender, string> = {
  mujer: 'Mujer',
  hombre: 'Hombre',
  otro: 'Otro',
  prefiero_no_decir: '',
};

function ConectarContent() {
  const searchParams = useSearchParams();
  const profileIdFromUrl = searchParams.get('profileId');
  const [profileId, setProfileId] = useState<string | null>(profileIdFromUrl);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityMatch[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileIdFromUrl) {
      try {
        const stored = localStorage.getItem('salto_last_profile_id');
        if (stored) setProfileId(stored);
      } catch {
        /* ignore */
      }
    }
  }, [profileIdFromUrl]);

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/oportunidades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(json.error || 'No pudimos cargar oportunidades.');
          return;
        }
        if (!cancelled) {
          setProfile(json.profile);
          setOpportunities(json.opportunities || []);
          setNote(json.note || null);
        }
      } catch {
        if (!cancelled) setError('Error de red.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (!profileId && !loading) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <MessageSquareQuote size={32} className="text-emerald-600 mx-auto mb-4" />
        <h1 className="text-2xl font-display font-bold text-slate-900 mb-3">Primero necesitas tu perfil</h1>
        <p className="text-slate-600 text-sm mb-8 leading-relaxed">
          Completa la entrevista para que podamos mostrarte empresas compatibles con tu potencial.
        </p>
        <Link href="/joven/chat">
          <Button size="lg" className="gap-2">
            Empezar entrevista <ArrowRight size={16} />
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-24 text-center text-slate-500 text-sm">
        Buscando empresas que encajen con tu perfil…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <AlertCircle className="text-rose-500 mx-auto mb-4" size={32} />
        <p className="text-slate-700 mb-6">{error}</p>
        <Link href={`/joven/perfil/${profileId}`}>
          <Button variant="outline">Volver a mi perfil</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
      <header>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Conectar con empresas
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-tight">
          Así te ven las empresas en Salto.
        </h1>
        {profile && (
          <p className="mt-4 text-slate-600 max-w-2xl leading-relaxed">
            <strong className="text-slate-900">{profile.name}</strong>, {profile.age} años
            {profile.gender && profile.gender !== 'prefiero_no_decir'
              ? ` · ${GENDER_LABEL[profile.gender]}`
              : ''}
            . Estas son las necesidades publicadas que más encajan con tu Perfil de Evidencia (ICS estimado).
          </p>
        )}
      </header>

      {note === 'no_needs' && (
        <section className="border-2 border-dashed border-slate-300 bg-slate-50 rounded-2xl p-10 text-center">
          <Building2 size={36} className="text-slate-400 mx-auto mb-4" />
          <h2 className="font-display font-semibold text-xl text-slate-900 mb-2">Aún no hay empresas publicadas</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6 leading-relaxed">
            Cuando un emprendimiento publique su necesidad, aparecerá aquí con tu % de compatibilidad. Mientras tanto, descarga tu CV ATS.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href={`/joven/perfil/${profileId}`}>
              <Button variant="outline">Mi perfil y CV</Button>
            </Link>
            <Link href="/empresa/publicar">
              <Button variant="ghost" className="text-slate-600">
                ¿Conoces una empresa? Invítala
              </Button>
            </Link>
          </div>
        </section>
      )}

      {opportunities.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">
            <Network size={14} className="text-emerald-500" />
            Oportunidades compatibles
          </div>

          {opportunities.map((opp, i) => (
            <article
              key={opp.needId}
              className={`bg-white border rounded-2xl p-6 md:p-8 transition-all ${
                i === 0 ? 'border-emerald-200 shadow-md shadow-emerald-100/40' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  {i === 0 && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-transparent mb-1">
                      <Sparkles size={12} className="mr-1" />
                      Mejor encaje
                    </Badge>
                  )}
                  <h2 className="font-display font-bold text-2xl text-slate-900">{opp.companyName}</h2>
                  <p className="text-slate-700">{opp.role}</p>
                  <p className="text-sm text-slate-600 italic border-l-2 border-emerald-200 pl-3 mt-3">{opp.reason}</p>
                </div>
                <div className="flex items-baseline gap-1 md:text-right">
                  <span className="font-display font-bold text-5xl text-emerald-600 tabular-nums">{opp.ics}</span>
                  <span className="text-xl text-emerald-600 font-bold">%</span>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold ml-2 self-end pb-2">
                    ICS
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-3">
                <Button className="gap-2" disabled title="Próximamente: mensajería directa">
                  Quiero conectar
                </Button>
                <Link href={`/empresa/matches/${opp.needId}`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    Ver cómo te rankea la empresa <ArrowRight size={12} />
                  </Button>
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="bg-slate-950 text-white rounded-2xl p-8 text-center">
        <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
          El ICS es una señal de priorización, no un veredicto. Cuando una empresa te contacte, sabrás por qué encajaste — algo que LinkedIn casi nunca te dice.
        </p>
        <Link href={`/joven/perfil/${profileId}`} className="inline-block mt-6">
          <Button variant="outline" className="bg-transparent border-slate-600 text-white hover:bg-slate-800">
            Volver a mi perfil
          </Button>
        </Link>
      </section>
    </div>
  );
}

export default function ConectarPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-6 py-24 text-center text-slate-500 text-sm">Cargando…</div>
      }
    >
      <ConectarContent />
    </Suspense>
  );
}
