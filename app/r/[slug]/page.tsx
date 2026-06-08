'use client';

/**
 * Landing pública de marca de la reclutadora — `/r/[slug]`.
 *
 * Sin RoleGate: cualquiera con el link puede verla y arrancar la entrevista.
 * Trae la marca pública por slug; si el slug no existe, muestra una página
 * neutra con CTA al chat genérico (nunca un dead-end). Al entrar al chat
 * persiste el contexto de marca para que `/joven/chat` lo siga aplicando.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Sparkles, ShieldCheck, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { SaltoLogo } from '@/components/ui/salto-logo';
import type { RecruiterBrandPublic } from '@/lib/recruiter-config';

const DEFAULT_PRIMARY = '#059669'; // emerald-600

export default function RecruiterLandingPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [state, setState] = useState<'loading' | 'found' | 'notfound'>('loading');
  const [brand, setBrand] = useState<RecruiterBrandPublic | null>(null);

  useEffect(() => {
    if (!slug) {
      setState('notfound');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recruiter-config?slug=${encodeURIComponent(slug)}`);
        if (cancelled) return;
        if (!res.ok) {
          setState('notfound');
          return;
        }
        const data = await res.json();
        if (data?.brand?.slug) {
          setBrand(data.brand as RecruiterBrandPublic);
          setState('found');
        } else {
          setState('notfound');
        }
      } catch {
        if (!cancelled) setState('notfound');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const primary = useMemo(
    () => brand?.brand?.primaryColor || DEFAULT_PRIMARY,
    [brand]
  );

  if (state === 'loading') {
    return <LoadingSpinner variant="full" label="Cargando…" />;
  }

  if (state === 'notfound' || !brand) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-5">
            <MessageCircle size={20} />
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Este enlace no está disponible
          </h1>
          <p className="text-slate-600 mt-3 leading-relaxed">
            No encontramos una entrevista para este link, pero igual puedes contar tu
            historia y armar tu Perfil de Evidencia con SaltoAI.
          </p>
          <Link href="/joven/chat" className="block mt-7">
            <Button size="lg" className="w-full gap-2">
              Empezar mi entrevista <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const interviewer = brand.interviewerName?.trim();
  const welcome =
    brand.brand?.welcomeMessage?.trim() ||
    `Cuéntame tu historia y descubramos juntos tu verdadero valor profesional.`;

  return (
    <div
      className="min-h-screen bg-[#FAFAF7] flex flex-col"
      style={{ ['--brand-primary' as string]: primary }}
    >
      <main className="flex-1 flex items-center justify-center px-6 py-14 sm:py-20">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Hero con acento de marca */}
            <div
              className="px-8 sm:px-12 pt-12 pb-10 text-center relative"
              style={{
                background: `linear-gradient(180deg, ${primary}14 0%, #ffffff 100%)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {brand.brand?.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={brand.brand.logoUrl}
                  alt={brand.displayName}
                  className="h-16 w-16 rounded-2xl object-cover mx-auto mb-5 ring-1 ring-slate-200"
                />
              ) : (
                <div
                  className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-5 text-white"
                  style={{ backgroundColor: primary }}
                >
                  <Sparkles size={26} />
                </div>
              )}

              <div
                className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
                style={{ color: primary }}
              >
                Entrevista personalizada
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
                {brand.displayName}
              </h1>
              {brand.brand?.tagline && (
                <p className="text-slate-600 mt-3 max-w-lg mx-auto leading-relaxed">
                  {brand.brand.tagline}
                </p>
              )}
            </div>

            {/* Cuerpo */}
            <div className="px-8 sm:px-12 py-8 sm:py-10 border-t border-slate-100">
              <p className="text-slate-700 leading-relaxed text-center text-[15px]">
                {interviewer ? (
                  <>
                    Hola, soy <strong className="text-slate-900">{interviewer}</strong>.{' '}
                  </>
                ) : null}
                {welcome}
              </p>

              <div className="mt-8 flex flex-col items-center gap-4">
                <Link href={`/joven/chat?r=${encodeURIComponent(brand.slug)}`} className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto gap-2 text-white border-0"
                    style={{ backgroundColor: primary }}
                  >
                    Empezar entrevista <ArrowRight size={16} />
                  </Button>
                </Link>
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck size={13} /> Gratis para ti · 3 a 5 preguntas · ~10 minutos
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
            <SaltoLogo size={18} className="opacity-60" />
            <span>Con tecnología de SaltoAI</span>
          </div>
        </div>
      </main>
    </div>
  );
}
