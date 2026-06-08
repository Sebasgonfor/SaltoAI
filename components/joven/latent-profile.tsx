'use client';

/**
 * Perfil latente — la devolución que revela lo que el joven HIZO pero no sabe
 * que tiene valor de mercado: habilidades ocultas, capacidades transversales,
 * roles sugeridos y un mensaje de cierre cercano (en la voz de la reclutadora
 * cuando el candidato llegó por un link /r/[slug]).
 *
 * Hasta ahora `/api/talento-latente` generaba esto pero no se mostraba en
 * ningún lado. Este componente lo dispara (idempotente/cacheado server-side) y
 * lo renderiza. Si no hay evidencia suficiente, no muestra nada (sin dead-end).
 */

import { useEffect, useState } from 'react';
import { Sparkles, Lightbulb, Compass, Quote, Loader2 } from 'lucide-react';
import type { LatentProfile } from '@/lib/types';
import { Stagger, StaggerItem } from '@/components/ui/motion';

const CONFIDENCE_LABEL: Record<string, { label: string; cls: string }> = {
  high: { label: 'Evidencia fuerte', cls: 'bg-emerald-100 text-emerald-800' },
  medium: { label: 'Evidencia media', cls: 'bg-amber-100 text-amber-800' },
  low: { label: 'Indicio', cls: 'bg-slate-100 text-slate-600' },
};

// Caché en memoria por profileId: la página "Potencial" se re-monta cada vez
// que navegás a ella, y antes eso re-disparaba el loader "Revelando tu talento
// latente…". Con este caché, al re-entrar pinta al instante y solo revalida en
// segundo plano (sin spinner). La generación server-side ya es idempotente.
const latentCache = new Map<string, LatentProfile>();

export default function LatentProfileSection({ profileId }: { profileId: string }) {
  const [latent, setLatent] = useState<LatentProfile | null>(
    () => latentCache.get(profileId) ?? null,
  );
  const [loading, setLoading] = useState(() => !latentCache.has(profileId));

  useEffect(() => {
    let cancelled = false;
    // Si ya está en caché, pintamos al instante y revalidamos en silencio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLatent(latentCache.get(profileId) ?? null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(!latentCache.has(profileId));
    (async () => {
      try {
        // POST dispara la generación (idempotente: si ya existe, la devuelve).
        const res = await fetch('/api/talento-latente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId }),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data?.latent) {
            latentCache.set(profileId, data.latent as LatentProfile);
            setLatent(data.latent as LatentProfile);
          }
        }
      } catch {
        /* silencioso: el perfil sigue siendo útil sin esta sección */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 flex items-center gap-3 text-slate-500">
        <Loader2 size={18} className="animate-spin text-emerald-600" />
        <span className="text-sm">Revelando tu talento latente…</span>
      </section>
    );
  }

  const hasContent =
    !!latent &&
    ((latent.hiddenSkills?.length ?? 0) > 0 ||
      (latent.suggestedRoles?.length ?? 0) > 0 ||
      !!latent.closingMessage);

  if (!hasContent || !latent) return null;

  return (
    <section className="space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1 flex items-center gap-1.5">
          <Sparkles size={12} /> Tu talento latente
        </div>
        <h2 className="font-display font-bold text-2xl md:text-3xl text-slate-900 tracking-tight leading-tight">
          Lo que ya sabes hacer — y no sabías que vale.
        </h2>
      </div>

      {/* Mensaje de cierre cercano */}
      {latent.closingMessage && (
        <div className="bg-slate-950 text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/15 rounded-full blur-3xl" aria-hidden />
          <Quote size={20} className="text-emerald-400 mb-3" />
          <p className="relative text-lg sm:text-xl font-display leading-relaxed">
            {latent.closingMessage}
          </p>
        </div>
      )}

      {/* Habilidades ocultas */}
      {latent.hiddenSkills?.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 mb-4">
            <Lightbulb size={16} className="text-amber-500" /> Habilidades ocultas
          </h3>
          <Stagger className="grid md:grid-cols-2 gap-4" stagger={0.06}>
            {latent.hiddenSkills.map((s, i) => {
              const conf = CONFIDENCE_LABEL[s.confidence] ?? CONFIDENCE_LABEL.low;
              return (
                <StaggerItem key={i} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-200 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h4 className="font-semibold text-slate-900 leading-snug">{s.name}</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${conf.cls}`}>
                      {conf.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 italic mb-2 leading-relaxed">
                    “{s.derivedFrom}”
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">{s.marketContext}</p>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      )}

      {/* Capacidades transversales */}
      {latent.transversalSkills?.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-900 mb-3">Capacidades transversales</h3>
          <div className="flex flex-wrap gap-2">
            {latent.transversalSkills.map((t, i) => (
              <span
                key={i}
                className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-1.5 rounded-full"
                title={t.derivedFrom}
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Roles sugeridos */}
      {latent.suggestedRoles?.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 mb-4">
            <Compass size={16} className="text-emerald-600" /> Roles donde encajas
          </h3>
          <Stagger className="space-y-3" stagger={0.06}>
            {latent.suggestedRoles.map((r, i) => (
              <StaggerItem key={i} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-200 transition-colors">
                <h4 className="font-semibold text-slate-900 mb-1.5">{r.roleTitle}</h4>
                <p className="text-sm text-slate-700 leading-relaxed mb-2">{r.whyFits}</p>
                <p className="text-xs text-emerald-700 bg-emerald-50/70 rounded-lg px-3 py-2 leading-relaxed">
                  <span className="font-semibold">Para ganarte la entrevista:</span> {r.readinessHint}
                </p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}
    </section>
  );
}
