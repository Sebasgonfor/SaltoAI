'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  User,
  Layers,
  ArrowRight,
  Building2,
  Check,
  RotateCcw,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Keyboard,
  Radio,
  Phone,
  PhoneOff,
  Pause,
  Play,
} from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useLiveInterview } from '@/hooks/use-live-interview';
import { CLOSING_MESSAGE_EMPRESA } from '@/lib/interview-prompt';

const MAX_TURNS = 6;

/**
 * 5 slots (4 obligatorios + 1 opcional) — sincronizado con
 * /api/entrevista-empresa/route.ts. Si cambian las regex allá, espejarlas
 * aquí para que el panel lateral del chat refleje lo que el backend ve.
 */
const SLOTS: { key: string; label: string; match: RegExp; optional?: boolean }[] = [
  {
    key: 'vacante',
    label: 'Rol a cubrir',
    match: /(busc[oa]mos|busc[oa]ndo|busco|necesit[oa]mos|necesito|queremos|el rol es|el puesto|vacante|abrimos posición|alguien (de|que|para)|una persona (de|que|para)|estamos contratando|persona para|profesional para|junior|senior|trainee|dev|desarrollador|programad|community|content|marketing|marketplace|e-?commerce|vendedor|cajero|atenci[óo]n|administrad|operario|asistente|secretari|repartidor|disenad|qa\b|product manager|pm\b|porque no (tenemos|hay)|para (crecer|vender|aumentar))/i,
  },
  {
    key: 'tareas_del_rol',
    label: 'Tareas del rol',
    match: /(atender|vender|contestar|publicar|editar|cobrar|inventario|caja|reels?|tiktok|instagram|whatsapp|client[ea]s?|pedidos?|entregas?|reuniones?|coordin|escribir|disenar|cocinar|despachar|empacar|hacer rutas|llevar contabilidad|gestion|reportes?|ventas|cierre|prospect)/i,
  },
  {
    key: 'contexto_equipo',
    label: 'Contexto del equipo',
    match: /(\d+\s*(persona|activ[oa]s?|integrantes?|emplead|colaborad)|somos\s*\d+|equipo|fundador|cofounder|socio|empresa|emprendimiento|startup|r[áa]pido|caos|presi[óo]n|estres|multitarea|presencial|remoto|h[íi]brido|horario|turnos?|jornada|barrio|local|oficina|ciudad|barranquilla|bogot[áa]|medell[ií]n|cali)/i,
  },
  {
    key: 'no_negociables',
    label: 'No negociables',
    match: /(requisito|obligatorio|s[íi] o s[íi]|no-?negociable|jornada completa|tiempo completo|ingl[ée]s|espa[ñn]ol|excel|portugu[ée]s|licencia|mayor de|m[íi]nimo \d+|deal-?breaker|esencial|imprescindible|prefer|valoramos|importante que|sin lo cual|descartam|descart[éa]|no aplica|no funcion[óo])/i,
  },
  {
    key: 'experiencia_previa',
    label: 'Experiencia previa',
    optional: true,
    match: /(contratamos|antes|anterior|nos fall[óo]|se fue|renunci[óo]|no aguant[óo]|primera vez|nunca (he|hemos) contratado|este es el primer|jam[áa]s contratamos|intentamos antes|el anterior|la anterior|el [úu]ltimo|la [úu]ltima)/i,
  },
];

interface CompanyLegal {
  companyName: string;
  taxId: string;
  legalRepName: string;
  legalRepDocId: string;
  acceptedTerms: boolean;
  acceptedAt: string;
}

interface ChatPersistedState {
  phase: 'legal' | 'interview';
  legal: CompanyLegal | null;
  form: Omit<CompanyLegal, 'acceptedAt'>;
  messages: ChatMessage[];
  input: string;
}

function storageKey(uid: string | null | undefined): string {
  return `salto_empresa_chat_${uid || 'anon'}`;
}

function loadPersisted(uid: string | null | undefined): ChatPersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatPersistedState;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersisted(uid: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(uid));
  } catch {
    /* ignore */
  }
}

function buildOpeningMessage(name: string): ChatMessage {
  const short = name.split(/\s+/)[0] || name;
  return {
    role: 'agent',
    // Apertura alineada con el primer slot (vacante). Antes preguntaba por
    // el EQUIPO primero — eso contradecía el orden del prompt y hacía que
    // el LLM volviera al final del chat a preguntar el rol que estaba
    // "incompleto" en su modelo interno. Ahora arrancamos por lo crítico.
    content: `Listo ${short}, ya tenemos lo legal. Ahora vamos al rol — pero no me des un cargo genérico, cuéntame el contexto real. Para arrancar: ¿qué rol específico estás contratando, cuántas vacantes son, y qué disparó la necesidad ahora?`,
  };
}

// Validaciones mínimas, no estrictas por jurisdicción. El backend valida el
// resto. Apuntamos a frenar envíos vacíos / obviamente falsos, sin bloquear
// formatos válidos de CO/ES/MX/etc.
function validateTaxId(v: string): string | null {
  const trimmed = v.trim();
  if (trimmed.length < 6) return 'El identificador fiscal parece muy corto.';
  if (!/[0-9]/.test(trimmed)) return 'El identificador fiscal debe tener al menos un número.';
  return null;
}

function validateDocId(v: string): string | null {
  const trimmed = v.trim();
  if (trimmed.length < 5) return 'El documento del representante parece muy corto.';
  return null;
}

export default function ChatEmpresa() {
  const router = useRouter();
  const { user } = useAuth();

  const [phase, setPhase] = useState<'legal' | 'interview'>('legal');
  const [legal, setLegal] = useState<CompanyLegal | null>(null);
  const [form, setForm] = useState<Omit<CompanyLegal, 'acceptedAt'>>({
    companyName: '',
    taxId: '',
    legalRepName: '',
    legalRepDocId: '',
    acceptedTerms: false,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [restored, setRestored] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [interviewMode, setInterviewMode] = useState<'text' | 'voice'>('text');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadPersisted(user?.uid);
    if (saved) {
      if (saved.phase) setPhase(saved.phase);
      if (saved.legal) setLegal(saved.legal);
      if (saved.form) setForm((f) => ({ ...f, ...saved.form }));
      if (Array.isArray(saved.messages)) setMessages(saved.messages);
      if (typeof saved.input === 'string') setInput(saved.input);
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (!restored || typeof window === 'undefined') return;
    const payload: ChatPersistedState = { phase, legal, form, messages, input };
    try {
      localStorage.setItem(storageKey(user?.uid), JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [restored, phase, legal, form, messages, input, user?.uid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, closing, phase]);

  useEffect(() => {
    if (user?.displayName && !form.legalRepName) {
      setForm((f) => ({ ...f, legalRepName: user.displayName ?? '' }));
    }
  }, [user, form.legalRepName]);


  const resetAll = () => {
    if (closing) return;
    const ok =
      typeof window === 'undefined' ||
      window.confirm('¿Reiniciar la conversación? Se borra la entrevista actual y empiezas de nuevo con los mismos datos de empresa.');
    if (!ok) return;
    live.disconnect();
    live.resetMessages();
    setMessages([]);
    setInput('');
    setSubmitError(null);
    setLoading(false);
    setClosing(false);
    setInterviewMode('text');
  };

  const startInterview = () => {
    const name = form.companyName.trim();
    const repName = form.legalRepName.trim();
    if (name.length < 2) {
      setFormError('Escribe la razón social o nombre comercial de la empresa.');
      return;
    }
    const taxErr = validateTaxId(form.taxId);
    if (taxErr) {
      setFormError(taxErr);
      return;
    }
    if (repName.length < 2) {
      setFormError('Escribe el nombre completo del representante legal.');
      return;
    }
    const docErr = validateDocId(form.legalRepDocId);
    if (docErr) {
      setFormError(docErr);
      return;
    }
    if (!form.acceptedTerms) {
      setFormError('Tienes que aceptar los Términos y la Política de Privacidad para continuar.');
      return;
    }
    const legalRecord: CompanyLegal = {
      companyName: name,
      taxId: form.taxId.trim(),
      legalRepName: repName,
      legalRepDocId: form.legalRepDocId.trim(),
      acceptedTerms: true,
      acceptedAt: new Date().toISOString(),
    };
    setLegal(legalRecord);
    setFormError(null);
    setMessages([buildOpeningMessage(repName)]);
    setPhase('interview');
  };

  const finalizeNeed = useCallback(async (history: ChatMessage[]) => {
    if (!legal || !user) return;
    setClosing(true);
    const rawDescription = history
      .filter((m) => m.role === 'user')
      .map((m) => m.content.trim())
      .join('\n\n');
    try {
      const res = await fetch('/api/necesidad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: legal.companyName,
          rawDescription,
          ownerUid: user.uid,
          ownerEmail: user.email,
          ownerName: user.displayName,
          legal,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) {
        const fallback =
          data?.error ||
          'No pudimos construir tu necesidad con lo que contaste. Profundiza un poco más con un ejemplo concreto.';
        setMessages((prev) => [...prev, { role: 'agent', content: fallback }]);
        setSubmitError(fallback);
        setClosing(false);
        return;
      }
      clearPersisted(user?.uid);
      router.push(`/empresa/matches/${data.id}`);
    } catch {
      setSubmitError('Error de red. Prueba enviar de nuevo en un momento.');
      setClosing(false);
    }
  }, [legal, user, router]);

  const finalizeNeedRef = useRef(finalizeNeed);
  useEffect(() => { finalizeNeedRef.current = finalizeNeed; }, [finalizeNeed]);

  const live = useLiveInterview({
    mode: 'empresa',
    companyName: legal?.companyName,
    closingMessage: CLOSING_MESSAGE_EMPRESA,
    closingKeywords: ['estructurar tu necesidad', 'buscar candidatos', 'suficiente contexto'],
    onInterviewComplete: (conversation) => {
      disconnectLiveRef.current?.();
      setMessages(conversation);
      void finalizeNeedRef.current(conversation);
    },
  });

  const disconnectLiveRef = useRef(live.disconnect);
  useEffect(() => { disconnectLiveRef.current = live.disconnect; }, [live.disconnect]);

  const displayMessages =
    interviewMode === 'voice' && (live.isActive || live.messages.length > 0)
      ? live.messages
      : messages;

  const userTurns =
    interviewMode === 'voice' && (live.isActive || live.messages.length > 0)
      ? live.userTurns
      : messages.filter((m) => m.role === 'user').length;
  const displayTurns = Math.min(userTurns, MAX_TURNS);

  const detected = useMemo(() => {
    const text = displayMessages.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
    const set = new Set<string>();
    for (const s of SLOTS) if (s.match.test(text)) set.add(s.key);
    return set;
  }, [displayMessages]);

  const wordsCount = useMemo(() => {
    return displayMessages
      .filter((m) => m.role === 'user')
      .reduce((acc, m) => acc + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
  }, [displayMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [live.messages, live.liveUserText, live.liveAgentText]);

  const sendUserMessage = async () => {
    if (!input.trim() || loading || closing || !legal) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    setSubmitError(null);

    // AbortController para que el spinner no quede colgado si el backend
    // se cae. Con flash-lite + thinking off el p99 server-side son ~3s; 15s
    // es margen suficiente para que el fallback determinístico también pase.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch('/api/entrevista-empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      const agentMsg: ChatMessage = {
        role: 'agent',
        content: data.nextQuestion || 'Cuéntame más sobre eso, ¿puedes darme un ejemplo concreto?',
      };
      const updated = [...history, agentMsg];
      setMessages(updated);
      setLoading(false);

      if (data.done) {
        await finalizeNeed(updated);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const aborted = (err as Error)?.name === 'AbortError';
      console.error('entrevista-empresa.error', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: aborted
            ? 'Estoy demorando más de la cuenta. Prueba enviar la respuesta otra vez en un momento.'
            : 'Tuvimos un problema. ¿Puedes contarme otra vez?',
        },
      ]);
      setSubmitError(
        aborted
          ? 'El servidor demoró demasiado. Reinténtalo en unos segundos.'
          : 'No pudimos contactar al servidor. Revisa tu conexión y reinténtalo.'
      );
      setLoading(false);
    }
  };

  if (phase === 'legal') {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 lg:py-16 w-full">
        <header className="mb-8 sm:mb-10 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Building2 size={28} strokeWidth={1.75} />
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
            Paso 1 de 2 · Datos de la empresa
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
            Primero, ¿quién contrata?
          </h1>
          <p className="text-slate-600 mt-3 leading-relaxed max-w-md mx-auto">
            Pedimos lo mínimo para verificar que la empresa existe y puede contratar. Sin esto no abrimos la búsqueda.
          </p>
        </header>

        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 shadow-sm">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Razón social o nombre comercial
            </label>
            <Input
              placeholder="Ej. Arepas El Primo S.A.S."
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="h-11 sm:h-12 text-sm sm:text-base"
              autoComplete="organization"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Identificador fiscal <span className="text-slate-400 font-normal">(NIT / CIF / RFC / RUT)</span>
            </label>
            <Input
              placeholder="Ej. 900.123.456-7"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              className="h-12 text-base"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Lo validamos contra registro público antes de publicar matches.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-3">
              Representante legal
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Nombre completo</label>
                <Input
                  placeholder="Ej. Camila Silva Rodríguez"
                  value={form.legalRepName}
                  onChange={(e) => setForm({ ...form, legalRepName: e.target.value })}
                  className="h-12 text-base"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Documento de identidad
                </label>
                <Input
                  placeholder="Ej. C.C. 1.001.234.567"
                  value={form.legalRepDocId}
                  onChange={(e) => setForm({ ...form, legalRepDocId: e.target.value })}
                  className="h-12 text-base"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 border-t border-slate-100 pt-6 cursor-pointer">
            <input
              type="checkbox"
              checked={form.acceptedTerms}
              onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })}
              className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              Declaro que tengo facultad para contratar en nombre de la empresa y acepto los{' '}
              <Link href="/legal/terminos?from=/empresa/chat" className="text-emerald-700 underline" target="_blank" rel="noopener noreferrer">
                Términos de uso
              </Link>{' '}
              y la{' '}
              <Link href="/legal/privacidad?from=/empresa/chat" className="text-emerald-700 underline" target="_blank" rel="noopener noreferrer">
                Política de Privacidad
              </Link>{' '}
              de SaltoAI, incluyendo el tratamiento de datos personales de candidatos.
            </span>
          </label>

          {formError && (
            <p
              className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
              role="alert"
            >
              {formError}
            </p>
          )}

          <Button size="lg" className="w-full h-12 gap-2" onClick={startInterview}>
            Continuar a la entrevista <ArrowRight size={16} />
          </Button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mt-6 flex gap-3">
          <ShieldCheck size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-900">Por qué pedimos esto:</strong> protegemos a los candidatos
            de empresas fantasma. Tu información no se publica — solo se usa para validar y para los
            contratos cuando contrates a alguien.
          </div>
        </div>

      </div>
    );
  }

  return (
    // Full-height layout: ocupa todo el viewport menos los 80px del topbar
    // sticky del layout (h-20). El header del chat y el grid se reparten ese
    // espacio sin generar scroll externo en el body. En mobile/pantallas
    // bajas se relaja a min-h para no aplastar el contenido.
    <div className="md:h-[calc(100dvh-80px)] md:overflow-hidden max-w-7xl mx-auto w-full flex flex-col px-4 sm:px-6 py-4 sm:py-6">
      <header className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-3 flex-shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
            Paso 2 de 2 · Entrevista
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
            Cuéntame el contexto real, sin jerga.
          </h1>
          <div className="text-slate-600 mt-2 max-w-xl">
            {legal && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal border-slate-200">
                  {legal.companyName}
                </Badge>
                <Badge variant="outline" className="font-normal border-slate-200">
                  {legal.taxId}
                </Badge>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: MAX_TURNS }).map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i < displayTurns
                    ? 'w-6 bg-emerald-500'
                    : i === displayTurns && displayTurns < MAX_TURNS
                    ? 'w-6 bg-slate-300'
                    : 'w-2 bg-slate-200'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500 tabular-nums font-medium">
            {displayTurns}/{MAX_TURNS}
          </span>
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-white">
            <Button
              type="button"
              variant={interviewMode === 'text' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                if (closing || loading || live.isActive || live.status === 'connecting') return;
                live.disconnect();
                setInterviewMode('text');
                if (messages.length === 0 && legal) {
                  setMessages([buildOpeningMessage(form.legalRepName)]);
                }
              }}
              disabled={closing || loading || live.isActive || live.status === 'connecting' || userTurns > 0}
            >
              <Keyboard size={14} />
              Texto
            </Button>
            <Button
              type="button"
              variant={interviewMode === 'voice' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                if (closing || loading || live.isActive || live.status === 'connecting') return;
                setInterviewMode('voice');
                setMessages([]);
              }}
              disabled={closing || loading || live.isActive || live.status === 'connecting' || userTurns > 0}
            >
              <Radio size={14} />
              Voz
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAll}
            disabled={loading || closing}
            className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 gap-1.5 -ml-1"
            title="Reiniciar todo desde el paso 1"
          >
            <RotateCcw size={14} />
            Reiniciar
          </Button>
        </div>
      </header>

      {submitError && (
        <div className="mb-4 flex items-start gap-2.5 text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3.5 rounded-lg">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-4 lg:gap-6 flex-1 min-h-0">
        <section className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[360px] sm:min-h-[480px] md:min-h-0 overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 min-h-0">
            {displayMessages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'agent' && (
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50">
                    <Sparkles size={16} />
                  </div>
                )}
                <div
                  className={`px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl max-w-[92%] sm:max-w-[85%] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white rounded-br-md'
                      : 'bg-stone-50 border border-slate-100 text-slate-800 rounded-bl-md'
                  }`}
                >
                  <p className={`text-sm sm:text-[15px] whitespace-pre-wrap ${msg.role === 'agent' ? 'font-display' : ''}`}>
                    {msg.content}
                  </p>
                </div>
                {msg.role === 'user' && (
                  user?.photoURL ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Tú'}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full flex-shrink-0 object-cover ring-2 ring-slate-100"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600">
                      <User size={16} />
                    </div>
                  )
                )}
              </div>
            ))}
            {interviewMode === 'voice' && (live.liveUserText || live.liveAgentText) && (
              <div className="space-y-3 pt-2 border-t border-dashed border-slate-200">
                {live.liveUserText && (
                  <div className="flex gap-3 justify-end opacity-80">
                    <div className="px-4 py-2 rounded-2xl max-w-[85%] bg-slate-700/90 text-white text-sm italic">
                      {live.liveUserText}
                    </div>
                    {user?.photoURL ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Tú'}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full flex-shrink-0 object-cover ring-2 ring-slate-100 opacity-80"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500">
                        <User size={16} />
                      </div>
                    )}
                  </div>
                )}
                {live.liveAgentText && (
                  <div className="flex gap-3 justify-start opacity-80">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                      <Sparkles size={16} />
                    </div>
                    <div className="px-4 py-2 rounded-2xl max-w-[85%] bg-stone-50 border border-slate-100 text-slate-700 text-sm italic font-display">
                      {live.liveAgentText}
                    </div>
                  </div>
                )}
              </div>
            )}
            {(loading || closing) && interviewMode === 'text' && (
              <div className="flex gap-3 justify-start">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50">
                  <Sparkles size={16} />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-stone-50 border border-slate-100 text-slate-800 rounded-bl-md flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  {closing && (
                    <span className="text-xs text-emerald-700 ml-2 font-medium">
                      Estructurando tu necesidad y buscando candidatos…
                    </span>
                  )}
                </div>
              </div>
            )}
            {closing && interviewMode === 'voice' && (
              <div className="flex gap-3 justify-start">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50">
                  <Sparkles size={16} />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-stone-50 border border-slate-100 text-slate-800 rounded-bl-md flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="text-xs text-emerald-700 ml-2 font-medium">Estructurando tu necesidad y buscando candidatos…</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            {interviewMode === 'voice' ? (
              <>
                {live.error && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3" role="alert">
                    {live.error}
                  </p>
                )}
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    {live.status === 'connecting' && (
                      <>
                        <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                        Conectando…
                      </>
                    )}
                    {live.status === 'listening' && (
                      <>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Escuchando
                      </>
                    )}
                    {live.status === 'agentSpeaking' && (
                      <>
                        <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                        El asistente está hablando
                      </>
                    )}
                    {live.status === 'paused' && (
                      <>
                        <span className="w-2 h-2 bg-slate-400 rounded-full" />
                        Pausado — toca Retomar para continuar
                      </>
                    )}
                    {live.status === 'idle' && !live.isActive && (
                      <span>Toca el botón para iniciar la conversación por voz</span>
                    )}
                    {live.status === 'closed' && !closing && (
                      <span>Sesión de voz finalizada</span>
                    )}
                    {live.status === 'error' && (
                      <span className="text-rose-600">Error de conexión — prueba de nuevo o usa modo texto</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(live.status === 'idle' || live.status === 'closed' || live.status === 'error') && !live.isActive && (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="h-20 w-20 rounded-full p-0 flex-shrink-0 border-2 border-emerald-300"
                        onClick={() => void live.connect()}
                        disabled={closing}
                        title="Iniciar conversación por voz"
                        aria-label="Iniciar conversación por voz"
                      >
                        <Phone size={28} />
                      </Button>
                    )}
                    {(live.status === 'listening' || live.status === 'agentSpeaking') && (
                      <>
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          className="h-16 w-16 rounded-full p-0 flex-shrink-0 border-slate-300"
                          onClick={live.pause}
                          disabled={closing}
                          title="Pausar conversación"
                          aria-label="Pausar conversación"
                        >
                          <Pause size={24} />
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="default"
                          className={`h-20 w-20 rounded-full p-0 flex-shrink-0 ${
                            live.status === 'agentSpeaking'
                              ? 'bg-violet-600 hover:bg-violet-700 animate-pulse'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                          onClick={live.disconnect}
                          disabled={closing}
                          title="Finalizar sesión de voz"
                          aria-label="Finalizar sesión de voz"
                        >
                          <PhoneOff size={28} />
                        </Button>
                      </>
                    )}
                    {live.status === 'paused' && (
                      <>
                        <Button
                          type="button"
                          size="lg"
                          variant="default"
                          className="h-20 w-20 rounded-full p-0 flex-shrink-0 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => void live.resume()}
                          disabled={closing}
                          title="Retomar conversación"
                          aria-label="Retomar conversación"
                        >
                          <Play size={28} />
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          className="h-16 w-16 rounded-full p-0 flex-shrink-0 border-rose-300 text-rose-600 hover:bg-rose-50"
                          onClick={live.disconnect}
                          disabled={closing}
                          title="Finalizar sesión de voz"
                          aria-label="Finalizar sesión de voz"
                        >
                          <PhoneOff size={24} />
                        </Button>
                      </>
                    )}
                    {live.status === 'connecting' && (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="h-20 w-20 rounded-full p-0 flex-shrink-0 border-2 border-amber-300"
                        disabled
                        aria-label="Conectando"
                      >
                        <Phone size={28} className="opacity-50" />
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 text-center max-w-sm leading-relaxed">
                    Modo voz en tiempo real: habla naturalmente, el asistente responde con voz de IA y ves la transcripción en vivo.
                    Usa audífonos para mejor calidad.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex gap-2 items-end">
                <Textarea
                  placeholder="Cuéntame con tus palabras…"
                  className="resize-none h-11 sm:h-[64px] min-h-[44px] sm:min-h-[64px] bg-white text-sm sm:text-[15px] leading-relaxed"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendUserMessage();
                    }
                  }}
                  disabled={loading || closing}
                />
                <Button
                  className="h-11 sm:h-[64px] px-3 sm:px-5 gap-1.5 sm:gap-2 flex-shrink-0"
                  onClick={sendUserMessage}
                  disabled={loading || closing || !input.trim()}
                >
                  <span className="hidden sm:inline">Enviar</span>
                  <ArrowRight size={16} />
                </Button>
              </div>
            )}
          </div>
        </section>

        <aside className="lg:col-span-5 space-y-3 sm:space-y-4 lg:overflow-y-auto lg:h-full lg:min-h-0 lg:pr-1">
          <div className="bg-slate-950 text-white rounded-3xl p-5 sm:p-6 relative overflow-hidden">
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-emerald-400" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold">
                  Detectando en vivo
                </span>
              </div>
              <h2 className="font-display font-bold text-2xl tracking-tight mb-1 leading-tight">
                Señales en tu contexto
              </h2>
              {detected.size === 0 ? (
                <div className="text-sm text-slate-400 italic border border-dashed border-slate-700 rounded-xl p-4 text-center mt-4">
                  Cuéntame el caos como es, no la versión LinkedIn.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {SLOTS.map((s) => {
                    const active = detected.has(s.key);
                    return (
                      <span
                        key={s.key}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          active
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900/60 text-slate-500 border-slate-800'
                        }`}
                      >
                        {active && <span className="mr-1">●</span>}
                        {s.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                Palabras
              </div>
              <div className="font-display font-bold text-2xl sm:text-3xl text-slate-900 tabular-nums">
                {wordsCount}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                Slots cubiertos
              </div>
              <div className="font-display font-bold text-2xl sm:text-3xl text-emerald-600 tabular-nums">
                {detected.size}/{SLOTS.length}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-3">
            <FileText size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Al terminar estructuramos rol, contexto, skills y restricciones, y traemos{' '}
              <strong className="text-slate-900">hasta 10 candidatos con score ICS explicable</strong>.
            </p>
          </div>

          <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-4 flex gap-3">
            <Layers size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-semibold">Tip:</strong> describe el día real. "Atiende caja,
              contesta WhatsApp y arma pedidos" es mucho mejor señal que "perfil multifuncional".
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
