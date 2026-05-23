'use client';

/**
 * Panel "Personalizar CV ATS" en la página del Perfil de Evidencia.
 *
 * Dos jugadas:
 *   1. Picker de PLANTILLA (5 estilos: minimalist / hybrid / functional /
 *      chronological / creative). Cada uno se ve distinto y tiene una
 *      compatibilidad ATS distinta — el badge se lo dice al joven.
 *   2. Form opcional de DATOS DE CONTACTO + idiomas + educación + certs.
 *      Persistente en localStorage por profileId.
 *
 * El "one-click" sigue funcionando aun con todos los campos vacíos.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Download,
  FileText,
  Printer,
  ChevronDown,
  ChevronUp,
  Settings2,
  Eye,
  Star,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

type CvStyle = 'minimalist' | 'hybrid' | 'functional' | 'chronological' | 'creative';

interface StyleCard {
  id: CvStyle;
  label: string;
  tagline: string;
  description: string;
  atsScore: number;
  bestFor: string;
}

/**
 * Mantener sincronizado con `CV_STYLES` en `lib/cv-templates.ts`.
 * La ruta /api/cv?styles=list lo expone, pero hardcodear acá nos ahorra
 * un round-trip al cargar la página y mantiene la UI snappy.
 */
const STYLES: StyleCard[] = [
  {
    id: 'minimalist',
    label: 'ATS minimalista',
    tagline: 'Una columna, máximo parseable',
    description: 'El formato más seguro para portales tipo Computrabajo, Greenhouse, Workday.',
    atsScore: 5,
    bestFor: 'Postulaciones a empresas grandes o portales con ATS automático.',
  },
  {
    id: 'hybrid',
    label: 'Híbrido / Combinado',
    tagline: 'Skills + logros por competencia',
    description: 'Lo mejor de los dos mundos: resumen de habilidades arriba, logros agrupados por competencia.',
    atsScore: 5,
    bestFor: 'Recomendado para Salto — usa tu evidencia citada como puntos fuertes.',
  },
  {
    id: 'functional',
    label: 'Funcional',
    tagline: 'Agrupado por competencia',
    description: 'Tu evidencia se ordena por habilidad, no por timeline. Cada skill brilla con sus logros.',
    atsScore: 4,
    bestFor: 'Junior sin historial cronológico formal; cambios de carrera.',
  },
  {
    id: 'chronological',
    label: 'Cronológico',
    tagline: 'Experiencia con fechas',
    description: 'El formato corporativo estándar: experiencia en orden reverso. Útil si tu educación tiene fechas.',
    atsScore: 5,
    bestFor: 'Roles corporativos o sectores tradicionales.',
  },
  {
    id: 'creative',
    label: 'Creativo / Diseño',
    tagline: 'Dos columnas, color y tipografía',
    description: 'Layout visual con sidebar. Aviso: NO pasa ciertos ATS estrictos.',
    atsScore: 2,
    bestFor: 'Roles creativos donde el portfolio importa más que el ATS.',
  },
];

const DEFAULT_STYLE: CvStyle = 'minimalist';

interface CvFields {
  email: string;
  phone: string;
  city: string;
  linkedin: string;
  languages: string;
  education: string;
  certifications: string;
  headline: string;
}

const EMPTY: CvFields = {
  email: '',
  phone: '',
  city: '',
  linkedin: '',
  languages: 'Español (nativo)',
  education: '',
  certifications: '',
  headline: '',
};

function lsKeyFields(profileId: string) {
  return `salto.cv.${profileId}`;
}
function lsKeyStyle(profileId: string) {
  return `salto.cv.style.${profileId}`;
}

function loadFields(profileId: string): CvFields {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(lsKeyFields(profileId));
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<CvFields>) };
  } catch {
    return EMPTY;
  }
}

function loadStyle(profileId: string): CvStyle {
  if (typeof window === 'undefined') return DEFAULT_STYLE;
  try {
    const raw = window.localStorage.getItem(lsKeyStyle(profileId));
    if (raw && STYLES.some((s) => s.id === raw)) return raw as CvStyle;
  } catch {
    /* ignore */
  }
  return DEFAULT_STYLE;
}

function AtsScore({ value }: { value: number }) {
  // 5 estrellas, las apagadas en gris. Resumen visual del trade-off.
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Compatibilidad ATS: ${value} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={11}
          className={i < value ? 'text-emerald-500 fill-emerald-500' : 'text-slate-200 fill-slate-200'}
        />
      ))}
    </span>
  );
}

export default function CvCustomizer({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<CvFields>(EMPTY);
  const [style, setStyle] = useState<CvStyle>(DEFAULT_STYLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFields(loadFields(profileId));
    setStyle(loadStyle(profileId));
    setHydrated(true);
  }, [profileId]);

  // Persistencia: ambos slots (fields + style) por profileId.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(lsKeyFields(profileId), JSON.stringify(fields));
    } catch {
      /* quota */
    }
  }, [fields, profileId, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(lsKeyStyle(profileId), style);
    } catch {
      /* quota */
    }
  }, [style, profileId, hydrated]);

  const buildUrl = useMemo(() => {
    return (extra: Record<string, string>) => {
      const sp = new URLSearchParams();
      sp.set('profileId', profileId);
      sp.set('style', style);
      (Object.entries(fields) as [keyof CvFields, string][]).forEach(([k, v]) => {
        if (v && v.trim()) sp.set(k, v.trim());
      });
      for (const [k, v] of Object.entries(extra)) sp.set(k, v);
      return `/api/cv?${sp.toString()}`;
    };
  }, [fields, profileId, style]);

  const set = <K extends keyof CvFields>(k: K, v: CvFields[K]) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  const activeStyle = STYLES.find((s) => s.id === style) ?? STYLES[0];
  const isCreative = style === 'creative';

  const completion = useMemo(() => {
    const required = ['email', 'phone', 'city'] as const;
    const filled = required.filter((k) => fields[k].trim().length > 0).length;
    return { filled, total: required.length };
  }, [fields]);

  return (
    <div className="space-y-4">
      {/* ---------- Picker de plantilla ---------- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Plantilla de CV
          </div>
          <div className="text-xs text-slate-500">
            Compatibilidad ATS: <AtsScore value={activeStyle.atsScore} />
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Elegí el estilo de CV"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2"
        >
          {STYLES.map((s) => {
            const active = s.id === style;
            return (
              <button
                key={s.id}
                role="radio"
                aria-checked={active}
                type="button"
                onClick={() => setStyle(s.id)}
                className={`text-left p-3 rounded-xl border transition-all relative ${
                  active
                    ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
                title={`${s.description}\n\nIdeal para: ${s.bestFor}`}
              >
                {active && (
                  <CheckCircle2
                    size={16}
                    className="absolute top-2 right-2 text-emerald-600 fill-white"
                  />
                )}
                <div className="text-[13px] font-semibold text-slate-900 leading-tight pr-5">
                  {s.label}
                </div>
                <div className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">{s.tagline}</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <AtsScore value={s.atsScore} />
                  {s.atsScore <= 2 && (
                    <AlertTriangle size={10} className="text-amber-600" aria-label="Riesgo ATS" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-slate-600 leading-relaxed">
          <strong className="text-slate-900">{activeStyle.label}.</strong> {activeStyle.description}{' '}
          <span className="text-slate-500">Ideal para {activeStyle.bestFor}</span>
        </p>
        {isCreative && (
          <p className="mt-2 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed flex gap-2 items-start">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              <strong>Aviso de ATS:</strong> el formato creativo es de 2 columnas y algunos parsers
              corporativos lo rompen. Para portales como Workday/Greenhouse, elegí <em>ATS
              minimalista</em> o <em>Híbrido</em>.
            </span>
          </p>
        )}
      </div>

      {/* ---------- Botones primarios ---------- */}
      <div className="flex flex-wrap gap-2">
        <a href={buildUrl({ autoprint: '1' })} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2">
            <Printer size={14} /> Imprimir / Guardar PDF
          </Button>
        </a>
        <a href={buildUrl({})} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-700">
            <Eye size={14} /> Vista previa
          </Button>
        </a>
        <a href={buildUrl({ download: '1' })} download>
          <Button variant="ghost" size="sm" className="gap-2 text-slate-700">
            <Download size={14} /> Descargar HTML
          </Button>
        </a>
        <a href={buildUrl({ format: 'json' })} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-700">
            <FileText size={14} /> Texto plano
          </Button>
        </a>
      </div>

      {/* ---------- Form colapsable de datos extras ---------- */}
      <div className="bg-white border border-slate-200 rounded-2xl">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 rounded-2xl transition"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-sm">
            <Settings2 size={14} className="text-slate-500" />
            <span className="font-medium text-slate-900">Personalizar antes de enviar</span>
            <span className="text-[11px] text-slate-500">
              {completion.filled}/{completion.total} contacto · idiomas · educación
            </span>
          </span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {open && (
          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Estos campos completan el CV con datos que el Perfil de Evidencia no captura. Todo es opcional; se guardan localmente en tu navegador.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Email</span>
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="tu@email.com"
                  value={fields.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Teléfono</span>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="+57 300 000 0000"
                  value={fields.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Ciudad</span>
                <Input
                  placeholder="Barranquilla, Colombia"
                  value={fields.city}
                  onChange={(e) => set('city', e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">LinkedIn</span>
                <Input
                  placeholder="linkedin.com/in/tu-usuario"
                  value={fields.linkedin}
                  onChange={(e) => set('linkedin', e.target.value)}
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  Subtítulo / Headline profesional
                </span>
                <Input
                  placeholder="Por defecto: tus 3 skills principales separadas por ·"
                  value={fields.headline}
                  onChange={(e) => set('headline', e.target.value)}
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Idiomas</span>
                <Input
                  placeholder="Español (nativo), Inglés (B1)"
                  value={fields.languages}
                  onChange={(e) => set('languages', e.target.value)}
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Educación</span>
                <Textarea
                  rows={2}
                  placeholder="Bachiller — IE Distrital Las Nieves (2022). Tecnólogo en proceso — SENA, 2024."
                  value={fields.education}
                  onChange={(e) => set('education', e.target.value)}
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  Certificaciones y cursos
                </span>
                <Textarea
                  rows={2}
                  placeholder="Curso de Marketing Digital — Platzi (2024). Servicio al Cliente — SENA (2023)."
                  value={fields.certifications}
                  onChange={(e) => set('certifications', e.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <a href={buildUrl({ autoprint: '1' })} target="_blank" rel="noopener noreferrer">
                <Button className="gap-2">
                  <Printer size={14} /> Imprimir con estos datos
                </Button>
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-500"
                onClick={() => setFields(EMPTY)}
              >
                Limpiar campos
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
