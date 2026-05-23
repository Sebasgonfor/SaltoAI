'use client';

/**
 * Panel "Personalizar CV ATS" sobre la página del Perfil de Evidencia.
 *
 * Mantiene el "one-click" (botón directo arriba) pero ofrece campos
 * opcionales para que el joven complete contacto, idiomas, educación y
 * certificaciones — datos que el Perfil de Evidencia NO captura por sí
 * solo y que cualquier ATS espera ver.
 *
 * Valores persisten en localStorage por profileId — si refresca o vuelve,
 * los inputs se recuerdan; no perdemos UX por no tener auth.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Download, FileText, Printer, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';

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

function lsKey(profileId: string) {
  return `salto.cv.${profileId}`;
}

function loadFields(profileId: string): CvFields {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(lsKey(profileId));
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<CvFields>) };
  } catch {
    return EMPTY;
  }
}

export default function CvCustomizer({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<CvFields>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFields(loadFields(profileId));
    setHydrated(true);
  }, [profileId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(lsKey(profileId), JSON.stringify(fields));
    } catch {
      /* quota */
    }
  }, [fields, profileId, hydrated]);

  const buildUrl = useMemo(() => {
    return (extra: Record<string, string>) => {
      const sp = new URLSearchParams();
      sp.set('profileId', profileId);
      (Object.entries(fields) as [keyof CvFields, string][]).forEach(([k, v]) => {
        if (v && v.trim()) sp.set(k, v.trim());
      });
      for (const [k, v] of Object.entries(extra)) sp.set(k, v);
      return `/api/cv?${sp.toString()}`;
    };
  }, [fields, profileId]);

  const set = <K extends keyof CvFields>(k: K, v: CvFields[K]) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  const completion = useMemo(() => {
    const required = ['email', 'phone', 'city'] as const;
    const filled = required.filter((k) => fields[k].trim().length > 0).length;
    return { filled, total: required.length };
  }, [fields]);

  return (
    <div className="space-y-3">
      {/* Botones primarios — one-click sigue funcionando incluso vacío */}
      <div className="flex flex-wrap gap-2">
        <a href={buildUrl({ autoprint: '1' })} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2">
            <Printer size={14} /> Imprimir / Guardar PDF
          </Button>
        </a>
        <a href={buildUrl({ download: '1' })} download>
          <Button variant="ghost" size="sm" className="gap-2 text-slate-700">
            <Download size={14} /> Descargar HTML
          </Button>
        </a>
        <a href={buildUrl({ format: 'json' })} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-700">
            <FileText size={14} /> Texto plano (Computrabajo)
          </Button>
        </a>
      </div>

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
              {completion.filled}/{completion.total} datos de contacto · idiomas · educación
            </span>
          </span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {open && (
          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Estos campos completan el CV ATS con los datos que el Perfil de Evidencia no captura. Todo es opcional; se guardan localmente en tu navegador.
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
              <a href={buildUrl({})} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2">
                  Vista previa
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
