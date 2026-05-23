'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, Lightbulb, AlertTriangle, Wand2 } from 'lucide-react';

const EXAMPLES = [
  {
    company: 'Arepas El Primo',
    description:
      'Vamos a abrir nuestro primer local la próxima semana y somos un caos. Somos 3 personas. Necesito a alguien proactivo que atienda clientes, maneje nuestro Instagram (no sabemos la clave) y que aguante un ritmo rápido sin estresarse. Ideal si sabe vender.',
    tags: ['Atención al cliente', 'Redes sociales', 'Ventas'],
  },
  {
    company: 'Estudio Vela (diseño)',
    description:
      'Somos un estudio chico de diseño en Barranquilla, 4 personas. Buscamos a alguien junior que arme contenido para clientes pequeños: piezas para Instagram, copys cortos, edición básica de Reels. No necesita ser Photoshop experto, sí mucha curiosidad y autonomía para aprender herramientas nuevas sin que le digamos.',
    tags: ['Contenido digital', 'Edición', 'Autonomía'],
  },
  {
    company: 'Tienda Doña Inés',
    description:
      'Tienda de barrio que va a formalizarse. Necesito ayuda con caja, inventario, atender clientes y empezar a llevar pedidos por WhatsApp. La persona tiene que ser muy responsable con la plata, detallista, y dispuesta a aprender Excel y un sistema de inventario nuevo.',
    tags: ['Caja', 'Inventario', 'Atención al cliente'],
  },
];

const SIGNAL_HINTS = [
  { match: /\d+ persona|equipo (de|chico|peque)|somos/i, label: 'Tamaño del equipo' },
  { match: /(local|tienda|oficina|barrio|ciudad)/i, label: 'Contexto físico' },
  { match: /(rápid|caos|presión|estres|multitarea|cambio)/i, label: 'Ritmo / contexto operativo' },
  { match: /(client|venta|atien|recla)/i, label: 'Trato con clientes' },
  { match: /(red|instagram|tiktok|whatsapp|conten)/i, label: 'Canal digital' },
  { match: /(aprend|autodidact|sol[ao]|sin que)/i, label: 'Autonomía esperada' },
];

export default function PublicarEmpresa() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [rawDescription, setRawDescription] = useState('');

  const wordCount = rawDescription.trim().split(/\s+/).filter(Boolean).length;
  const quality = wordCount < 20 ? 'poca' : wordCount < 50 ? 'ok' : 'buena';

  const detectedHints = useMemo(() => {
    return SIGNAL_HINTS.filter((h) => h.match.test(rawDescription)).map((h) => h.label);
  }, [rawDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !rawDescription.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/necesidad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, rawDescription }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) {
        setError(data.error || 'No pudimos procesar tu necesidad.');
        setLoading(false);
        return;
      }
      router.push(`/empresa/matches/${data.id}`);
    } catch {
      setError('Error de red. Intenta de nuevo.');
      setLoading(false);
    }
  };

  const applyExample = (ex: (typeof EXAMPLES)[number]) => {
    setCompanyName(ex.company);
    setRawDescription(ex.description);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 lg:py-14 w-full">
      {/* HERO */}
      <header className="mb-10 max-w-3xl">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-600 font-semibold mb-3">Para empresas tempranas</div>
        <h1 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight leading-[1.05] mb-4">
          Contrata por <span className="text-emerald-600">potencial</span>,<br className="hidden md:block" /> no por años en un papel.
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
          Descríbenos tu contexto real con tus palabras. La IA estructura el rol, busca candidatos por compatibilidad y te devuelve 3 con desglose ICS explicable.
        </p>
      </header>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* FORM */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Nombre de tu emprendimiento
              </label>
              <Input
                placeholder="Ej. Arepas El Primo"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={loading}
                className="text-base h-12 bg-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-slate-900">
                  Tu problema real, con tus palabras
                </label>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {wordCount} palabras ·{' '}
                  <span
                    className={
                      quality === 'poca'
                        ? 'text-rose-600 font-medium'
                        : quality === 'ok'
                        ? 'text-amber-600 font-medium'
                        : 'text-emerald-600 font-medium'
                    }
                  >
                    señal {quality}
                  </span>
                </span>
              </div>
              <Textarea
                placeholder="Cuenta el contexto: cuánta gente sois, qué van a hacer, qué tipo de ritmo, qué les ha costado en contrataciones anteriores. No uses jerga corporativa — describe el caos como es."
                className="min-h-48 p-4 text-[15px] leading-relaxed bg-white"
                required
                value={rawDescription}
                onChange={(e) => setRawDescription(e.target.value)}
                disabled={loading}
              />
              <p className="text-[11px] text-slate-500 mt-2">
                <Sparkles size={11} className="inline mr-1 text-emerald-500" />
                La IA detectará el tamaño del equipo, ritmo, skills requeridos y restricciones automáticamente.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3.5 rounded-lg">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <Button variant="ghost" type="button" onClick={() => router.back()} disabled={loading}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || !companyName.trim() || !rawDescription.trim()}
                size="lg"
                className="gap-2 min-w-[200px]"
              >
                {loading ? 'Buscando matches…' : (
                  <>
                    Encontrar talento <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Detected hints */}
          {detectedHints.length > 0 && (
            <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wand2 size={14} className="text-emerald-700" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-800">
                  Ya detectamos en tu texto
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detectedHints.map((h) => (
                  <Badge key={h} className="bg-white text-emerald-800 border border-emerald-200">
                    {h}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* SIDE — ejemplos + tips */}
        <aside className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={14} className="text-amber-500" />
              <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-slate-700">
                Empieza desde un ejemplo
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Inspírate con descripciones reales. Click en cualquiera para autocompletar y editarla.
            </p>
            <div className="space-y-3">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyExample(ex)}
                  className="w-full text-left bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl p-4 transition-all group"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="font-semibold text-slate-900 text-sm">{ex.company}</span>
                    <span className="text-[10px] text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity">
                      Usar →
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2">{ex.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {ex.tags.map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 text-slate-600 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-950 text-white rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold mb-3">
              Qué pasa cuando envías
            </div>
            <ol className="space-y-3 text-sm">
              {[
                'Gemini estructura tu texto en rol, contexto, skills y rasgos.',
                'Vectorizamos tu necesidad y hacemos shortlist semántico.',
                'El motor ICS rankea los candidatos con desglose auditable.',
              ].map((step, i) => (
                <li key={i} className="flex gap-3 leading-relaxed">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-mono font-semibold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-slate-300">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
              Ves los 3 mejores con score ICS, no 200 CVs. Cada match cita evidencia concreta del candidato.
            </div>
          </div>

          <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-4 flex gap-3">
            <Lightbulb size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-semibold">Tip:</strong> describe el <em>caos real</em>. "Equipo de 3, abrimos local, sin protocolos" es mucho mejor señal que "buscamos un perfil multidisciplinario y proactivo".
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
