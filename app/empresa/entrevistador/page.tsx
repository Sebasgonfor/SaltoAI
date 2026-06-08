'use client';

/**
 * Configuración del entrevistador personalizado de la reclutadora.
 *
 * `/empresa/entrevistador` (gateado a rol empresa por el layout). Permite
 * definir identidad, voz baseline, idioma, foco, preguntas propias, señales a
 * priorizar y marca, y obtener el link compartible `/r/[slug]`.
 *
 * Esta es la Fase 2 (sin el wizard de estilo, que llega en Fase 3): el
 * `personaDescriptor` y los `styleSamples` se conservan si ya existen pero no se
 * editan desde aquí todavía.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Save,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_PERSONALITY,
  FOCUS_MAX,
  INSTRUCTIONS_MAX_CHARS,
  INTERVIEWER_NAME_MAX,
  MAX_CUSTOM_QUESTIONS,
  MAX_STYLE_SAMPLES,
  PERSONA_DESCRIPTOR_MAX,
  PERSONALITY_PRESETS,
  STYLE_SAMPLE_MAX_CHARS,
  TAGLINE_MAX,
  WELCOME_MAX,
  normalizeSlug,
  type InterviewLanguage,
  type PersonalityPreset,
  type RecruiterConfig,
  type StyleSample,
  type StyleSampleSource,
} from '@/lib/recruiter-config';
import { SIGNALS } from '@/lib/signals';

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface FormState {
  slug: string;
  displayName: string;
  interviewerName: string;
  personality: PersonalityPreset;
  language: InterviewLanguage;
  focus: string;
  instructions: string;
  customQuestions: string[];
  prioritySignals: string[];
  personaDescriptor: string;
  styleSamples: StyleSample[];
  logoUrl: string;
  primaryColor: string;
  tagline: string;
  welcomeMessage: string;
}

const EMPTY_FORM: FormState = {
  slug: '',
  displayName: '',
  interviewerName: '',
  personality: DEFAULT_PERSONALITY,
  language: DEFAULT_LANGUAGE,
  focus: '',
  instructions: '',
  customQuestions: [],
  prioritySignals: [],
  personaDescriptor: '',
  styleSamples: [],
  logoUrl: '',
  primaryColor: '',
  tagline: '',
  welcomeMessage: '',
};

// Preguntas guiadas del wizard "Tu estilo". Las respuestas se vuelven muestras
// de voz (source: 'wizard') que alimentan la destilación del personaDescriptor.
const WIZARD_QUESTIONS = [
  '¿Cómo saludas y rompes el hielo con alguien que entrevistas por primera vez?',
  'Cuando alguien te cuenta un logro, ¿cómo se lo reconoces? Escríbelo como lo dirías tú.',
  '¿Qué frase o muletilla usas seguido para animar o dar confianza?',
  'Cuando das feedback para mejorar, ¿cómo lo dices sin desanimar? Da un ejemplo.',
  '¿Qué tono evitas a toda costa (muy formal, frío, acartonado…)? Descríbelo.',
];

function configToForm(c: RecruiterConfig): FormState {
  return {
    slug: c.slug ?? '',
    displayName: c.displayName ?? '',
    interviewerName: c.interviewerName ?? '',
    personality: c.personality ?? DEFAULT_PERSONALITY,
    language: c.language ?? DEFAULT_LANGUAGE,
    focus: c.focus ?? '',
    instructions: c.instructions ?? '',
    customQuestions: (c.customQuestions ?? []).map((q) => q.text),
    prioritySignals: c.prioritySignals ?? [],
    personaDescriptor: c.personaDescriptor ?? '',
    styleSamples: c.styleSamples ?? [],
    logoUrl: c.brand?.logoUrl ?? '',
    primaryColor: c.brand?.primaryColor ?? '',
    tagline: c.brand?.tagline ?? '',
    welcomeMessage: c.brand?.welcomeMessage ?? '',
  };
}

// ─── sub-componentes ────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-800">{label}</label>
      {hint && <p className="text-xs text-slate-500 leading-snug">{hint}</p>}
      {children}
    </div>
  );
}

function SectionCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="font-display font-bold text-lg text-slate-900 tracking-tight">{title}</h2>
        {desc && <p className="text-sm text-slate-500 mt-1 leading-relaxed">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

// ─── página ─────────────────────────────────────────────────────────────────

export default function EntrevistadorConfigPage() {
  const { user, loading } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const [newQuestion, setNewQuestion] = useState('');
  const [copied, setCopied] = useState(false);

  // Wizard "Tu estilo".
  const [wizardAnswers, setWizardAnswers] = useState<string[]>(() =>
    WIZARD_QUESTIONS.map(() => '')
  );
  const [pasteText, setPasteText] = useState('');
  const [generating, setGenerating] = useState(false);
  const voice = useVoiceInput('es-CO');

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setOkMsg(null);
  }, []);

  // Muestras visibles en la lista = pegadas + audio (las del wizard viven en
  // sus inputs). assembleSamples() las une para destilar y para guardar.
  const listSamples = form.styleSamples.filter((s) => s.source !== 'wizard');

  const assembleSamples = useCallback((): StyleSample[] => {
    const wizard: StyleSample[] = wizardAnswers
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ source: 'wizard' as StyleSampleSource, text: text.slice(0, STYLE_SAMPLE_MAX_CHARS) }));
    const rest = form.styleSamples.filter((s) => s.source !== 'wizard');
    return [...wizard, ...rest].slice(0, MAX_STYLE_SAMPLES);
  }, [wizardAnswers, form.styleSamples]);

  const addSample = (source: StyleSampleSource, text: string) => {
    const t = text.trim().slice(0, STYLE_SAMPLE_MAX_CHARS);
    if (!t) return;
    setForm((f) => {
      const nonWizard = f.styleSamples.filter((s) => s.source !== 'wizard');
      if (nonWizard.length >= MAX_STYLE_SAMPLES) return f;
      return { ...f, styleSamples: [...f.styleSamples, { source, text: t }] };
    });
    setOkMsg(null);
  };

  const removeListSample = (idx: number) => {
    setForm((f) => {
      const list = f.styleSamples.filter((s) => s.source !== 'wizard');
      const target = list[idx];
      if (!target) return f;
      return { ...f, styleSamples: f.styleSamples.filter((s) => s !== target) };
    });
  };

  const recordSampleAudio = async () => {
    voice.clearError();
    if (voice.isRecording) {
      const text = await voice.stopRecording();
      if (text) addSample('audio', text);
    } else {
      await voice.startRecording();
    }
  };

  const generateStyle = async () => {
    setError(null);
    setOkMsg(null);
    setGenerating(true);
    const samples = assembleSamples();
    // Persistimos las muestras ensambladas (incluye respuestas del wizard).
    setForm((f) => ({ ...f, styleSamples: samples }));
    try {
      const res = await fetch('/api/recruiter-config/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleSamples: samples.map((s) => s.text),
          personality: form.personality,
          language: form.language,
          interviewerName: form.interviewerName,
          focus: form.focus,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.personaDescriptor) {
        setError(data.error || 'No pudimos generar tu estilo. Intenta de nuevo.');
        return;
      }
      setForm((f) => ({ ...f, personaDescriptor: data.personaDescriptor as string }));
      setOkMsg(
        data.degraded
          ? 'Estilo generado en modo básico (sin IA). Edítalo a tu gusto.'
          : 'Estilo generado. Revísalo y edítalo antes de guardar.'
      );
    } catch {
      setError('Error de red al generar tu estilo.');
    } finally {
      setGenerating(false);
    }
  };

  // Cargar config existente.
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recruiter-config?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        if (!cancelled && data?.config) {
          const cfg = data.config as RecruiterConfig;
          setForm(configToForm(cfg));
          setSavedSlug(cfg.slug);
          // Re-poblar los inputs del wizard con las muestras source:'wizard'
          // guardadas, por orden, para poder re-editarlas.
          const wizardTexts = (cfg.styleSamples ?? [])
            .filter((s) => s.source === 'wizard')
            .map((s) => s.text);
          if (wizardTexts.length) {
            setWizardAnswers(WIZARD_QUESTIONS.map((_, i) => wizardTexts[i] ?? ''));
          }
        }
      } catch {
        /* sin config previa: formulario vacío */
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Chequeo de disponibilidad de slug (debounced).
  const normalizedSlug = normalizeSlug(form.slug);
  const slugDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user?.uid) return;
    if (slugDebounce.current) clearTimeout(slugDebounce.current);
    if (!normalizedSlug) {
      setSlugStatus('idle');
      return;
    }
    setSlugStatus('checking');
    slugDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/recruiter-config/slug-available?slug=${encodeURIComponent(normalizedSlug)}&uid=${encodeURIComponent(user.uid)}`
        );
        const data = await res.json();
        if (!data.valid) setSlugStatus('invalid');
        else setSlugStatus(data.available ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 450);
    return () => {
      if (slugDebounce.current) clearTimeout(slugDebounce.current);
    };
  }, [normalizedSlug, user?.uid]);

  const toggleSignal = (id: string) => {
    setForm((f) => ({
      ...f,
      prioritySignals: f.prioritySignals.includes(id)
        ? f.prioritySignals.filter((s) => s !== id)
        : [...f.prioritySignals, id],
    }));
    setOkMsg(null);
  };

  const addQuestion = () => {
    const q = newQuestion.trim();
    if (!q || form.customQuestions.length >= MAX_CUSTOM_QUESTIONS) return;
    setForm((f) => ({ ...f, customQuestions: [...f.customQuestions, q] }));
    setNewQuestion('');
    setOkMsg(null);
  };

  const removeQuestion = (i: number) => {
    setForm((f) => ({
      ...f,
      customQuestions: f.customQuestions.filter((_, idx) => idx !== i),
    }));
  };

  const shareUrl =
    savedSlug && typeof window !== 'undefined'
      ? `${window.location.origin}/r/${savedSlug}`
      : '';

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('No pudimos copiar el link. Cópialo manualmente.');
    }
  };

  const save = async () => {
    if (!user?.uid) return;
    setError(null);
    setOkMsg(null);
    setSaving(true);
    // Ensamblamos las muestras (incluye respuestas del wizard) al guardar, así
    // se persisten aunque no se haya pulsado "Generar mi estilo".
    const styleSamples = assembleSamples();
    setForm((f) => ({ ...f, styleSamples }));
    try {
      const res = await fetch('/api/recruiter-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user.uid,
          slug: form.slug,
          displayName: form.displayName,
          interviewerName: form.interviewerName,
          personality: form.personality,
          language: form.language,
          focus: form.focus,
          instructions: form.instructions,
          customQuestions: form.customQuestions,
          prioritySignals: form.prioritySignals,
          personaDescriptor: form.personaDescriptor,
          styleSamples,
          brand: {
            logoUrl: form.logoUrl,
            primaryColor: form.primaryColor,
            tagline: form.tagline,
            welcomeMessage: form.welcomeMessage,
          },
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setSlugStatus('taken');
        setError(data.error || 'Ese link ya está en uso. Elige otro.');
        return;
      }
      if (!res.ok || !data.config) {
        setError(data.error || 'No pudimos guardar la configuración.');
        return;
      }
      const saved = data.config as RecruiterConfig;
      setForm(configToForm(saved));
      setSavedSlug(saved.slug);
      setOkMsg('Configuración guardada.');
    } catch {
      setError('Error de red al guardar. Revisa tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || initialLoading) {
    return <LoadingSpinner variant="full" label="Cargando tu configuración…" />;
  }

  const slugHintColor =
    slugStatus === 'available'
      ? 'text-emerald-600'
      : slugStatus === 'taken' || slugStatus === 'invalid'
      ? 'text-rose-600'
      : 'text-slate-500';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full space-y-6">
      <header>
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Tu entrevistador
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight leading-tight">
          Personaliza la entrevista con tu marca
        </h1>
        <p className="text-slate-600 mt-2 max-w-2xl leading-relaxed">
          Define cómo se presenta, qué tono usa y qué preguntas no pueden faltar. Comparte tu link
          propio y cada candidato vive la entrevista como si fueras tú.
        </p>
      </header>

      {/* Link compartible (si ya hay slug guardado) */}
      {savedSlug && (
        <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">
              Tu link compartible
            </div>
            <div className="text-sm text-slate-800 font-mono truncate">{shareUrl}</div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <a href={`/r/${savedSlug}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink size={14} /> Probar
              </Button>
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Check size={15} /> {okMsg}
        </div>
      )}

      {/* Identidad */}
      <SectionCard
        title="Identidad y link"
        desc="El nombre que ve el candidato y la dirección de tu landing."
      >
        <Field
          label="Link de tu entrevista"
          hint="Solo letras, números y guiones. Es la parte final de tu URL pública."
        >
          <div className="flex items-center rounded-md border border-slate-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
            <span className="px-3 text-sm text-slate-400 select-none border-r border-slate-200 bg-slate-50 h-11 flex items-center">
              /r/
            </span>
            <input
              className="flex-1 h-11 px-3 text-sm outline-none"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="merlys"
              maxLength={40}
            />
          </div>
          {normalizedSlug && (
            <p className={`text-xs mt-1 ${slugHintColor}`}>
              {slugStatus === 'checking' && 'Verificando disponibilidad…'}
              {slugStatus === 'available' && `✓ /r/${normalizedSlug} está disponible`}
              {slugStatus === 'taken' && 'Ese link ya está en uso. Prueba otro.'}
              {slugStatus === 'invalid' && 'Ese link no es válido o está reservado.'}
            </p>
          )}
        </Field>

        <Field label="Nombre a mostrar" hint="Tu marca o nombre, visible para el candidato.">
          <Input
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            placeholder="Merlys · Empleabilidad LATAM"
            maxLength={60}
          />
        </Field>

        <Field
          label="Nombre del entrevistador"
          hint="Cómo se presenta el agente (opcional). Ej. «María»."
        >
          <Input
            value={form.interviewerName}
            onChange={(e) => set('interviewerName', e.target.value)}
            placeholder="María"
            maxLength={INTERVIEWER_NAME_MAX}
          />
        </Field>
      </SectionCard>

      {/* Voz e idioma */}
      <SectionCard title="Tono e idioma" desc="El estilo base de la conversación.">
        <Field label="Personalidad base">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(PERSONALITY_PRESETS) as PersonalityPreset[]).map((key) => {
              const active = form.personality === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('personality', key)}
                  className={`text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {PERSONALITY_PRESETS[key].label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Idioma de la entrevista">
          <div className="flex gap-2">
            {(['es', 'en'] as InterviewLanguage[]).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => set('language', lng)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  form.language === lng
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {lng === 'es' ? 'Español' : 'English'}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Foco / sector"
          hint="Audiencia o sector para sesgar el feedback. Ej. «empleabilidad general, perfiles diversos»."
        >
          <Input
            value={form.focus}
            onChange={(e) => set('focus', e.target.value)}
            placeholder="empleabilidad general, no solo tech"
            maxLength={FOCUS_MAX}
          />
        </Field>

        <Field
          label="Instrucciones de estilo"
          hint="Preferencias libres. Son subordinadas a las reglas duras (no cambian turnos ni formato)."
        >
          <Textarea
            value={form.instructions}
            onChange={(e) => set('instructions', e.target.value.slice(0, INSTRUCTIONS_MAX_CHARS))}
            placeholder="Trata de tú, sé cercana, usa ejemplos cotidianos…"
            rows={3}
          />
          <p className="text-[11px] text-slate-400 text-right">
            {form.instructions.length}/{INSTRUCTIONS_MAX_CHARS}
          </p>
        </Field>
      </SectionCard>

      {/* Tu estilo — wizard de voz */}
      <SectionCard
        title="Tu estilo — voz como la tuya"
        desc="Responde unas preguntas, pega ejemplos o graba tu voz. Con eso destilamos un descriptor editable que el entrevistador imita (tono, calidez, muletillas)."
      >
        {/* Preguntas guiadas */}
        <div className="space-y-3">
          {WIZARD_QUESTIONS.map((q, i) => (
            <Field key={i} label={`${i + 1}. ${q}`}>
              <Textarea
                value={wizardAnswers[i] ?? ''}
                onChange={(e) => {
                  const v = e.target.value.slice(0, STYLE_SAMPLE_MAX_CHARS);
                  setWizardAnswers((prev) => {
                    const next = [...prev];
                    next[i] = v;
                    return next;
                  });
                  setOkMsg(null);
                }}
                placeholder="Escríbelo como lo dirías tú…"
                rows={2}
              />
            </Field>
          ))}
        </div>

        {/* Pegar ejemplos / grabar audio */}
        <Field
          label="Ejemplos o audios (opcional)"
          hint={`Pega un mensaje real tuyo, o graba tu voz y la transcribimos. Hasta ${MAX_STYLE_SAMPLES} muestras en total.`}
        >
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Pega aquí un mensaje o feedback que hayas escrito tú…"
            rows={2}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                addSample('pasted', pasteText);
                setPasteText('');
              }}
              disabled={!pasteText.trim() || listSamples.length >= MAX_STYLE_SAMPLES}
            >
              <Plus size={14} /> Añadir ejemplo
            </Button>
            {voice.isSupported && (
              <Button
                type="button"
                variant={voice.isRecording ? 'default' : 'outline'}
                size="sm"
                className={`gap-1.5 ${voice.isRecording ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}`}
                onClick={() => void recordSampleAudio()}
                disabled={voice.isTranscribing || listSamples.length >= MAX_STYLE_SAMPLES}
              >
                {voice.isTranscribing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Transcribiendo…
                  </>
                ) : voice.isRecording ? (
                  <>
                    <MicOff size={14} /> Detener y transcribir
                  </>
                ) : (
                  <>
                    <Mic size={14} /> Grabar mi voz
                  </>
                )}
              </Button>
            )}
          </div>
          {voice.error && (
            <p className="text-xs text-rose-600 mt-1.5">{voice.error}</p>
          )}
        </Field>

        {/* Muestras capturadas (pegadas + audio) */}
        {listSamples.length > 0 && (
          <ul className="space-y-2">
            {listSamples.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
              >
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mt-0.5 flex-shrink-0">
                  {s.source === 'audio' ? 'Audio' : 'Pegado'}
                </span>
                <span className="flex-1 text-sm text-slate-700">{s.text}</span>
                <button
                  type="button"
                  onClick={() => removeListSample(i)}
                  className="text-slate-400 hover:text-rose-600 flex-shrink-0 mt-0.5"
                  aria-label="Quitar muestra"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Generar estilo */}
        <div>
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            onClick={() => void generateStyle()}
            disabled={generating}
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {generating ? 'Generando…' : 'Generar mi estilo'}
          </Button>
        </div>

        {/* Descriptor editable */}
        <Field
          label="Mi descriptor de voz (editable)"
          hint="Esto es lo que el entrevistador imita. Ajústalo libremente; es solo estilo, no cambia las reglas de la entrevista."
        >
          <Textarea
            value={form.personaDescriptor}
            onChange={(e) => set('personaDescriptor', e.target.value.slice(0, PERSONA_DESCRIPTOR_MAX))}
            placeholder="Pulsa «Generar mi estilo» o escríbelo tú: cómo hablas, tu calidez, tus muletillas, qué haces y qué evitas…"
            rows={5}
          />
          <p className="text-[11px] text-slate-400 text-right">
            {form.personaDescriptor.length}/{PERSONA_DESCRIPTOR_MAX}
          </p>
        </Field>
      </SectionCard>

      {/* Preguntas propias */}
      <SectionCard
        title="Preguntas propias"
        desc={`Hasta ${MAX_CUSTOM_QUESTIONS}. El agente las teje en la conversación sin descuidar las señales.`}
      >
        <div className="flex gap-2">
          <Input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addQuestion();
              }
            }}
            placeholder="¿Qué te hace sentir orgullosa de tu trabajo?"
            maxLength={200}
            disabled={form.customQuestions.length >= MAX_CUSTOM_QUESTIONS}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-1.5 flex-shrink-0"
            onClick={addQuestion}
            disabled={!newQuestion.trim() || form.customQuestions.length >= MAX_CUSTOM_QUESTIONS}
          >
            <Plus size={14} /> Añadir
          </Button>
        </div>
        {form.customQuestions.length > 0 && (
          <ul className="space-y-2">
            {form.customQuestions.map((q, i) => (
              <li
                key={i}
                className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
              >
                <span className="flex-1 text-sm text-slate-700">{q}</span>
                <button
                  type="button"
                  onClick={() => removeQuestion(i)}
                  className="text-slate-400 hover:text-rose-600 flex-shrink-0 mt-0.5"
                  aria-label="Quitar pregunta"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Señales a priorizar */}
      <SectionCard
        title="Señales a priorizar"
        desc="El agente preguntará primero por estas. Las 12 señales se siguen detectando igual."
      >
        <div className="flex flex-wrap gap-2">
          {SIGNALS.map((s) => {
            const active = form.prioritySignals.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSignal(s.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-800 border-emerald-400'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {active && <span className="mr-1">●</span>}
                {s.label}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Marca */}
      <SectionCard title="Marca" desc="Color, logo y mensajes de tu landing pública.">
        <Field label="Logo (URL)" hint="Pega la URL de una imagen cuadrada. La carga de archivos llega pronto.">
          <Input
            value={form.logoUrl}
            onChange={(e) => set('logoUrl', e.target.value)}
            placeholder="https://…/logo.png"
            maxLength={500}
          />
        </Field>

        <Field label="Color principal">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.primaryColor || '#059669'}
              onChange={(e) => set('primaryColor', e.target.value)}
              className="h-11 w-14 rounded-md border border-slate-200 bg-white cursor-pointer p-1"
              aria-label="Color principal"
            />
            <Input
              value={form.primaryColor}
              onChange={(e) => set('primaryColor', e.target.value)}
              placeholder="#059669"
              maxLength={7}
              className="font-mono max-w-[140px]"
            />
            {form.primaryColor && (
              <button
                type="button"
                onClick={() => set('primaryColor', '')}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Quitar
              </button>
            )}
          </div>
        </Field>

        <Field label="Tagline" hint="Frase corta bajo tu nombre en la landing.">
          <Input
            value={form.tagline}
            onChange={(e) => set('tagline', e.target.value)}
            placeholder="Tu valor, en palabras que abren puertas."
            maxLength={TAGLINE_MAX}
          />
        </Field>

        <Field label="Mensaje de bienvenida" hint="Lo primero que lee el candidato en tu landing.">
          <Textarea
            value={form.welcomeMessage}
            onChange={(e) => set('welcomeMessage', e.target.value.slice(0, WELCOME_MAX))}
            placeholder="Cuéntame tu historia y descubramos juntos tu verdadero valor profesional."
            rows={2}
          />
          <p className="text-[11px] text-slate-400 text-right">
            {form.welcomeMessage.length}/{WELCOME_MAX}
          </p>
        </Field>
      </SectionCard>

      {/* Guardar (sticky) */}
      <div className="sticky bottom-4 z-10">
        <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm">
          <p className="text-xs text-slate-500 hidden sm:block pl-2">
            {savedSlug ? 'Cambios sin guardar se pierden al salir.' : 'Guarda para obtener tu link.'}
          </p>
          <Button onClick={save} disabled={saving} className="gap-2 ml-auto">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400 justify-center pb-4">
        <Sparkles size={13} /> Tus instrucciones y estilo son preferencias: nunca cambian las reglas de la entrevista.
      </div>
    </div>
  );
}
