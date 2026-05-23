'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bot, User, Sparkles, Layers, ArrowRight, MessageSquareQuote, UserCircle2, Check, RotateCcw } from 'lucide-react';
import type { ChatMessage, Gender, JovenBasics } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

const MAX_TURNS = 5;

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'mujer', label: 'Mujer' },
  { value: 'hombre', label: 'Hombre' },
  { value: 'otro', label: 'Otro' },
  { value: 'prefiero_no_decir', label: 'Prefiero no decir' },
];

function firstNameFrom(full: string): string {
  return full.trim().split(/\s+/)[0] || full.trim();
}

function buildOpeningMessage(name: string): ChatMessage {
  const first = firstNameFrom(name);
  return {
    role: 'agent',
    content: `Hola ${first}, soy tu asistente de Salto. Hoy no vamos a llenar un currículum — vamos a conversar. Cuéntame: ¿cuál ha sido el desafío más grande que has resuelto en el último año, aunque nadie te haya pagado por hacerlo?`,
  };
}

interface DetectedSignal {
  label: string;
  match: RegExp;
}

const SIGNALS: DetectedSignal[] = [
  { label: 'Iniciativa', match: /(yo (mismo|sola|solo)|decidí|propuse|me puse|empecé|arranqué)/i },
  { label: 'Aprendizaje autónomo', match: /(aprend[ií]|tutoriales?|youtube|sol[ao]|por mi cuenta|nadie me enseñó)/i },
  { label: 'Resolución de problemas', match: /(resolv[ií]|solucion[éae]|arreglé|encontr[éa] la forma|me las arreglé)/i },
  { label: 'Resultados medibles', match: /(\d+\s*%|ventas?|clientes?|seguidores?|aumenté|crecí|triplicó|dupliqué)/i },
  { label: 'Atención al cliente', match: /(client[ea]s?|reclam[oa]s?|atend[íi]|respondí)/i },
  { label: 'Trabajo en equipo', match: /(equipo|colaboré|junto a|compañer[oa]s?|coordin[éa])/i },
  { label: 'Adaptación al cambio', match: /(cambio|adaptarme|me ajusté|nuevo|de repente|sin previo)/i },
  { label: 'Persistencia', match: /(insist[íi]|seguí|no me rendí|volv[íi] a intentar|terminé)/i },
];

// Persistencia en localStorage para que la entrevista sobreviva navegación
// (salir a otra página y volver, refresh accidental, etc.). Una key por uid
// (o "anon") para no cruzar conversaciones entre usuarios distintos en el
// mismo navegador. Se limpia al crear el perfil con éxito.
interface ChatPersistedState {
  phase: 'basics' | 'interview';
  basics: JovenBasics | null;
  formName: string;
  formAge: string;
  formGender: Gender | '';
  messages: ChatMessage[];
  input: string;
}

function storageKey(uid: string | null | undefined): string {
  return `salto_chat_state_${uid || 'anon'}`;
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

export default function ChatJoven() {
  const router = useRouter();
  const { user } = useAuth();
  const [phase, setPhase] = useState<'basics' | 'interview'>('basics');
  const [basics, setBasics] = useState<JovenBasics | null>(null);
  const [formName, setFormName] = useState('');
  const [formAge, setFormAge] = useState('');
  const [formGender, setFormGender] = useState<Gender | ''>('');
  const [formError, setFormError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restaurar estado al montar (una vez por uid). Si la sesión cambia de
  // usuario, leemos la persistencia del usuario nuevo y descartamos el
  // estado en memoria.
  useEffect(() => {
    const saved = loadPersisted(user?.uid);
    if (saved) {
      if (saved.phase) setPhase(saved.phase);
      if (saved.basics) setBasics(saved.basics);
      if (typeof saved.formName === 'string') setFormName(saved.formName);
      if (typeof saved.formAge === 'string') setFormAge(saved.formAge);
      if (typeof saved.formGender === 'string') setFormGender(saved.formGender as Gender | '');
      if (Array.isArray(saved.messages)) setMessages(saved.messages);
      if (typeof saved.input === 'string') setInput(saved.input);
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Guardar cada vez que cambie algo relevante. Esperamos a `restored` para
  // no pisar la persistencia con los valores iniciales antes de leer.
  useEffect(() => {
    if (!restored || typeof window === 'undefined') return;
    const payload: ChatPersistedState = {
      phase,
      basics,
      formName,
      formAge,
      formGender,
      messages,
      input,
    };
    try {
      localStorage.setItem(storageKey(user?.uid), JSON.stringify(payload));
    } catch {
      /* localStorage puede fallar en modo privado; ignoramos. */
    }
  }, [restored, phase, basics, formName, formAge, formGender, messages, input, user?.uid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, closing, phase]);

  useEffect(() => {
    if (user?.displayName && !formName) setFormName(user.displayName);
  }, [user, formName]);

  const userTurns = messages.filter((m) => m.role === 'user').length;

  const detected = useMemo(() => {
    const text = messages.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
    const set = new Set<string>();
    for (const s of SIGNALS) if (s.match.test(text)) set.add(s.label);
    return set;
  }, [messages]);

  const wordsCount = useMemo(() => {
    return messages
      .filter((m) => m.role === 'user')
      .reduce((acc, m) => acc + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
  }, [messages]);

  const resetInterview = () => {
    if (closing) return;
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        '¿Reiniciar la entrevista? Se borra todo lo que llevás escrito y volvés al paso 1. Tus datos básicos (nombre, edad) también se vacían.'
      );
    if (!ok) return;
    clearPersisted(user?.uid);
    setMessages([]);
    setInput('');
    setBasics(null);
    setFormName(user?.displayName ?? '');
    setFormAge('');
    setFormGender('');
    setFormError(null);
    setLoading(false);
    setClosing(false);
    setPhase('basics');
  };

  const startInterview = () => {
    const name = formName.trim();
    const age = parseInt(formAge, 10);
    if (name.length < 2) {
      setFormError('Escribe tu nombre completo (mínimo 2 caracteres).');
      return;
    }
    if (!Number.isFinite(age) || age < 16 || age > 35) {
      setFormError('La edad debe estar entre 16 y 35 años.');
      return;
    }
    if (!formGender) {
      setFormError('Selecciona cómo te identificas.');
      return;
    }
    const b: JovenBasics = { name, age, gender: formGender };
    setBasics(b);
    setFormError(null);
    setMessages([buildOpeningMessage(name)]);
    setPhase('interview');
  };

  const sendUserMessage = async () => {
    if (!input.trim() || loading || closing || !basics) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/entrevista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          firstName: firstNameFrom(basics.name),
        }),
      });
      const data = await res.json();

      const agentMsg: ChatMessage = {
        role: 'agent',
        content: data.nextQuestion || 'Cuéntame más, ¿cómo lo hiciste?',
      };
      const updated = [...history, agentMsg];
      setMessages(updated);
      setLoading(false);

      if (data.done) {
        setClosing(true);
        const closeRes = await fetch('/api/perfil', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: updated,
            basics,
            uid: user?.uid,
            displayName: user?.displayName,
          }),
        });
        const closeData = await closeRes.json();
        if (closeData.id) {
          try {
            localStorage.setItem('salto_last_profile_id', closeData.id);
          } catch {
            /* ignore */
          }
          // Limpiamos la persistencia de la entrevista: ya cumplió su rol.
          clearPersisted(user?.uid);
          router.push(`/joven/perfil/${closeData.id}`);
        } else {
          // Casos borde (PRD §8.5): el agente cree que terminó pero el
          // extractor no encuentra evidencia suficiente. En vez de freezar,
          // devolvemos la conversación al usuario con el mensaje honesto.
          const fallback =
            closeData.error ||
            'No pudimos construir tu perfil con lo que contaste. Profundizá un poco más con un ejemplo concreto.';
          setMessages((prev) => [...prev, { role: 'agent', content: fallback }]);
          setClosing(false);
          setFormError(closeData.error || 'No pudimos crear tu perfil. Intenta de nuevo.');
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'agent', content: 'Tuvimos un problema. ¿Puedes contarme otra vez?' },
      ]);
      setLoading(false);
    }
  };

  if (phase === 'basics') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 lg:py-16 w-full">
        <header className="mb-10 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <UserCircle2 size={28} strokeWidth={1.75} />
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">Paso 1 de 2</div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
            Antes de tu historia, lo básico.
          </h1>
          <p className="text-slate-600 mt-3 leading-relaxed max-w-md mx-auto">
            Nombre y edad van en tu perfil y en el CV para ATS. El género lo eliges tú — no lo adivinamos por tu nombre.
          </p>
        </header>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Nombre completo</label>
            <Input
              placeholder="Ej. Camila Silva"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="h-12 text-base"
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Edad</label>
            <Input
              type="number"
              min={16}
              max={35}
              placeholder="Ej. 21"
              value={formAge}
              onChange={(e) => setFormAge(e.target.value)}
              className="h-12 text-base w-32"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-slate-900 mb-3" id="gender-label">
              ¿Cómo te identificas?
            </span>
            <div
              role="radiogroup"
              aria-labelledby="gender-label"
              aria-invalid={formError?.includes('identificas') ? true : undefined}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {GENDER_OPTIONS.map((opt) => {
                const selected = formGender === opt.value;
                const inputId = `gender-${opt.value}`;
                return (
                  <div key={opt.value}>
                    <input
                      type="radio"
                      id={inputId}
                      name="gender"
                      value={opt.value}
                      checked={selected}
                      onChange={() => {
                        setFormGender(opt.value);
                        if (formError?.includes('identificas')) setFormError(null);
                      }}
                      className="sr-only peer"
                    />
                    <label
                      htmlFor={inputId}
                      className={`flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-sm font-medium cursor-pointer transition-all ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {selected && <Check size={18} className="text-emerald-600 flex-shrink-0" aria-hidden />}
                    </label>
                  </div>
                );
              })}
            </div>
            {formError?.includes('identificas') && (
              <p className="text-sm text-rose-700 mt-2" role="alert">
                {formError}
              </p>
            )}
          </div>

          {formError && !formError.includes('identificas') && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
              {formError}
            </p>
          )}

          <Button size="lg" className="w-full h-12 gap-2" onClick={startInterview}>
            Continuar a mi historia <ArrowRight size={16} />
          </Button>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6 max-w-sm mx-auto leading-relaxed">
          Después conversamos 3–5 minutos sobre desafíos reales que hayas vivido. Eso alimenta tu Perfil de Evidencia.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 lg:py-12 w-full">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
            Paso 2 de 2 · Entrevista
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
            Cuéntame tu historia, {basics ? firstNameFrom(basics.name) : ''}.
          </h1>
          {/* `<Badge>` renderiza un `<div>`, así que el contenedor NO puede
              ser `<p>` (HTML inválido → hydration error). Usamos `<div>` y
              mantenemos el styling. */}
          <div className="text-slate-600 mt-2 max-w-xl">
            {basics && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal border-slate-200">
                  {basics.name}
                </Badge>
                <Badge variant="outline" className="font-normal border-slate-200">
                  {basics.age} años
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
                  i < userTurns
                    ? 'w-6 bg-emerald-500'
                    : i === userTurns
                    ? 'w-6 bg-slate-300'
                    : 'w-2 bg-slate-200'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500 tabular-nums font-medium">
            {userTurns}/{MAX_TURNS}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetInterview}
            disabled={loading || closing}
            className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 gap-1.5 -ml-1"
            title="Empezar de cero la entrevista"
          >
            <RotateCcw size={14} />
            Reiniciar
          </Button>
        </div>
      </header>

      {formError && phase === 'interview' && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{formError}</div>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col min-h-[600px] max-h-[700px] overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'agent' && (
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50">
                    <Bot size={16} />
                  </div>
                )}
                <div
                  className={`px-4 py-3 rounded-2xl max-w-[85%] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white rounded-br-md'
                      : 'bg-stone-50 border border-slate-100 text-slate-800 rounded-bl-md'
                  }`}
                >
                  <p className={`text-[15px] whitespace-pre-wrap ${msg.role === 'agent' ? 'font-display' : ''}`}>{msg.content}</p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600">
                    <User size={16} />
                  </div>
                )}
              </div>
            ))}
            {(loading || closing) && (
              <div className="flex gap-3 justify-start">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50">
                  <Bot size={16} />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-stone-50 border border-slate-100 text-slate-800 rounded-bl-md flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  {closing && (
                    <span className="text-xs text-emerald-700 ml-2 font-medium">Construyendo tu Perfil de Evidencia…</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder="Cuéntame con tus palabras…"
                className="resize-none h-[64px] min-h-[64px] bg-white text-[15px] leading-relaxed"
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
                className="h-[64px] px-5 gap-2"
                onClick={sendUserMessage}
                disabled={loading || closing || !input.trim()}
              >
                Enviar <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </section>

        <aside className="lg:col-span-5 space-y-4">
          <div className="bg-slate-950 text-white rounded-3xl p-6 relative overflow-hidden">
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-emerald-400" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold">Detectando en vivo</span>
              </div>
              <h2 className="font-display font-bold text-2xl tracking-tight mb-1 leading-tight">Señales en tu historia</h2>
              {detected.size === 0 ? (
                <div className="text-sm text-slate-400 italic border border-dashed border-slate-700 rounded-xl p-4 text-center mt-4">
                  Cuéntame qué hiciste, no qué quisiste hacer.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {SIGNALS.map((s) => {
                    const active = detected.has(s.label);
                    return (
                      <span
                        key={s.label}
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
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Palabras</div>
              <div className="font-display font-bold text-3xl text-slate-900 tabular-nums">{wordsCount}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Señales</div>
              <div className="font-display font-bold text-3xl text-emerald-600 tabular-nums">{detected.size}</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-3">
            <Layers size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Al terminar generamos tu perfil, tu <strong className="text-slate-900">CV ATS</strong> y podrás{' '}
              <strong className="text-slate-900">conectar con empresas</strong>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
