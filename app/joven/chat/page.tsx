'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bot, User, Sparkles, Layers, ArrowRight, RotateCcw, Mic, MicOff, Phone, PhoneOff, Keyboard, Radio } from 'lucide-react';
import type { ChatMessage, Gender, JovenBasics } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { RoleGate } from '@/components/auth/role-gate';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useLiveInterview } from '@/hooks/use-live-interview';
import { jovenAgeErrorMessage, parseJovenAge } from '@/lib/input-validation';
import { BasicsWizard } from '@/components/joven/basics-wizard';
import {
  CLOSING_MESSAGE,
  MAX_USER_TURNS,
  MIN_USER_TURNS,
} from '@/lib/interview-prompt';

const MIN_TURNS = MIN_USER_TURNS;
const MAX_TURNS = MAX_USER_TURNS;

const CLOSING_AGENT_MSG = CLOSING_MESSAGE;

type InterviewMode = 'text' | 'voice';

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
  basicsStep?: 0 | 1 | 2;
  messages: ChatMessage[];
  input: string;
  interviewMode?: InterviewMode;
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

/**
 * Default export envuelve el componente real con RoleGate. Antes el gate
 * vivía en el layout (gateaba TODO /joven/*), pero eso bloqueaba a las
 * empresas de ver perfiles. Ahora el gate vive aquí, en las pages que SÍ
 * son privadas del joven (chat, tareas, conectar).
 */
export default function ChatJovenPage() {
  return (
    <RoleGate role="joven">
      <ChatJoven />
    </RoleGate>
  );
}

function ChatJoven() {
  const router = useRouter();
  const { user } = useAuth();
  const [phase, setPhase] = useState<'basics' | 'interview'>('basics');
  const [basics, setBasics] = useState<JovenBasics | null>(null);
  const [formName, setFormName] = useState('');
  const [formAge, setFormAge] = useState('');
  const [formGender, setFormGender] = useState<Gender | ''>('');
  const [basicsStep, setBasicsStep] = useState<0 | 1 | 2>(0);
  const [formError, setFormError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [interviewMode, setInterviewMode] = useState<InterviewMode>('text');
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef('');
  const voiceBaseRef = useRef('');
  const finishInterviewRef = useRef<(conversation: ChatMessage[]) => Promise<void>>(async () => {});
  const {
    isSupported: voiceSupported,
    isRecording,
    isTranscribing,
    error: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError: clearVoiceError,
  } = useVoiceInput('es-CO');

  const {
    status: liveStatus,
    messages: liveMessages,
    liveUserText,
    liveAgentText,
    userTurns: liveUserTurns,
    error: liveError,
    connect: connectLive,
    disconnect: disconnectLive,
    clearError: clearLiveError,
    isActive: liveActive,
  } = useLiveInterview({
    firstName: basics ? firstNameFrom(basics.name) : undefined,
    onInterviewComplete: (conversation) => {
      disconnectLiveRef.current();
      setMessages(conversation);
      void finishInterviewRef.current?.(conversation);
    },
  });

  const disconnectLiveRef = useRef(disconnectLive);
  useEffect(() => {
    disconnectLiveRef.current = disconnectLive;
  }, [disconnectLive]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

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
      else if (typeof saved.formAge === 'number' && Number.isFinite(saved.formAge)) {
        setFormAge(String(saved.formAge));
      }
      if (typeof saved.formGender === 'string') setFormGender(saved.formGender as Gender | '');
      if (saved.basicsStep === 0 || saved.basicsStep === 1 || saved.basicsStep === 2) {
        setBasicsStep(saved.basicsStep);
      }
      if (Array.isArray(saved.messages)) setMessages(saved.messages);
      if (typeof saved.input === 'string') setInput(saved.input);
      if (saved.interviewMode === 'voice' || saved.interviewMode === 'text') {
        setInterviewMode(saved.interviewMode);
      }
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
      basicsStep,
      messages: interviewMode === 'voice' && liveActive ? liveMessages : messages,
      input,
      interviewMode,
    };
    try {
      localStorage.setItem(storageKey(user?.uid), JSON.stringify(payload));
    } catch {
      /* localStorage puede fallar en modo privado; ignoramos. */
    }
  }, [restored, phase, basics, formName, formAge, formGender, basicsStep, messages, input, interviewMode, liveMessages, liveActive, user?.uid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, liveMessages, liveUserText, liveAgentText, loading, closing, phase, interviewMode]);

  useEffect(() => {
    if (user?.displayName && !formName) setFormName(user.displayName);
  }, [user, formName]);

  const displayMessages =
    interviewMode === 'voice' && (liveActive || liveMessages.length > 0) ? liveMessages : messages;

  const userTurns =
    interviewMode === 'voice' && (liveActive || liveMessages.length > 0)
      ? liveUserTurns
      : messages.filter((m) => m.role === 'user').length;
  const displayTurns = Math.min(userTurns, MAX_TURNS);
  const atTurnLimit = userTurns >= MAX_TURNS;

  const detected = useMemo(() => {
    const text = displayMessages.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
    const set = new Set<string>();
    for (const s of SIGNALS) if (s.match.test(text)) set.add(s.label);
    return set;
  }, [displayMessages]);

  const wordsCount = useMemo(() => {
    return displayMessages
      .filter((m) => m.role === 'user')
      .reduce((acc, m) => acc + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
  }, [displayMessages]);

  const resetInterview = () => {
    if (closing) return;
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        '¿Reiniciar la entrevista? Se borra todo lo que llevás escrito y volvés al paso 1. Tus datos básicos (nombre, edad) también se vacían.'
      );
    if (!ok) return;
    cancelRecording('reset-interview');
    disconnectLive();
    clearPersisted(user?.uid);
    setMessages([]);
    setInput('');
    setBasics(null);
    setFormName(user?.displayName ?? '');
    setFormAge('');
    setFormGender('');
    setBasicsStep(0);
    setFormError(null);
    setLoading(false);
    setClosing(false);
    setInterviewMode('text');
    setPhase('basics');
  };

  const startInterview = () => {
    const name = formName.trim();
    const age = parseJovenAge(formAge);
    if (name.length < 2) {
      setFormError('Escribe tu nombre completo (mínimo 2 caracteres).');
      return;
    }
    if (age == null) {
      setFormError(jovenAgeErrorMessage());
      return;
    }
    if (!formGender) {
      setFormError('Selecciona cómo te identificas.');
      return;
    }
    const b: JovenBasics = { name, age, gender: formGender };
    setBasics(b);
    setFormError(null);
    if (interviewMode === 'text') {
      setMessages([buildOpeningMessage(name)]);
    } else {
      setMessages([]);
    }
    setPhase('interview');
  };

  const finishInterview = useCallback(
    async (conversation: ChatMessage[]) => {
      if (!basics || closing) return;
      setClosing(true);
      setLoading(false);
      try {
        const closeRes = await fetch('/api/perfil', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: conversation,
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
      } catch (err) {
        console.error(err);
        setClosing(false);
        setFormError('Error de red al crear tu perfil.');
      }
    },
    [basics, closing, router, user?.uid, user?.displayName]
  );

  useEffect(() => {
    finishInterviewRef.current = finishInterview;
  }, [finishInterview]);

  const sendUserMessage = async (textOverride?: string) => {
    cancelRecording('reset-interview');
    const content = (textOverride ?? inputRef.current).trim();
    if (!content || loading || closing || !basics) return;
    if (userTurns >= MAX_TURNS) return;

    const userMsg: ChatMessage = { role: 'user', content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);

    const turnsAfterSend = history.filter((m) => m.role === 'user').length;

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

      const shouldClose = !!data.done || turnsAfterSend >= MAX_TURNS;
      const agentContent = shouldClose
        ? CLOSING_AGENT_MSG
        : data.nextQuestion || '¿Qué hiciste tú concretamente en esa situación?';

      const updated = [...history, { role: 'agent' as const, content: agentContent }];
      setMessages(updated);
      setLoading(false);

      if (shouldClose) {
        await finishInterview(updated);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
      if (turnsAfterSend >= MAX_TURNS) {
        const updated = [...history, { role: 'agent' as const, content: CLOSING_AGENT_MSG }];
        setMessages(updated);
        await finishInterview(updated);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'agent', content: 'Tuvimos un problema de conexión. Intenta enviar de nuevo.' },
        ]);
      }
    }
  };

  const finishEarly = async () => {
    cancelRecording('reset-interview');
    if (!basics || loading || closing || userTurns < MIN_TURNS) return;
    if (interviewMode === 'voice' && liveActive) {
      disconnectLive();
    }
    const updated = [...displayMessages, { role: 'agent' as const, content: CLOSING_AGENT_MSG }];
    setMessages(updated);
    await finishInterview(updated);
  };

  const toggleLiveSession = async () => {
    if (closing) return;
    clearLiveError();
    if (liveActive || liveStatus === 'connecting') {
      disconnectLive();
    } else {
      await connectLive();
    }
  };

  // NOTA: el bloque `if (phase === 'basics')` que existía acá (con JSX inline
  // del wizard) era código stale dejado por un refactor a `<BasicsWizard>` —
  // el merge de feat/data lo dejó "cosido" con la siguiente función y rompió
  // el parser de TS. El render real del paso 1 vive más abajo (línea ~504).
  const switchInterviewMode = (mode: InterviewMode) => {
    if (closing || loading || liveActive || liveStatus === 'connecting') return;
    if (userTurns > 0) return;
    cancelRecording('mode-switch');
    disconnectLive();
    setInterviewMode(mode);
    if (mode === 'text' && basics) {
      setMessages([buildOpeningMessage(basics.name)]);
    } else {
      setMessages([]);
    }
  };

  const toggleVoice = async () => {
    if (loading || closing || atTurnLimit || isTranscribing) return;
    clearVoiceError();
    if (isRecording) {
      const transcribed = await stopRecording();
      const base = voiceBaseRef.current.trim();
      const combined = [base, transcribed].filter(Boolean).join(' ').trim();
      voiceBaseRef.current = '';
      if (combined) {
        setInput(combined);
        await sendUserMessage(combined);
      }
    } else {
      voiceBaseRef.current = inputRef.current;
      await startRecording();
    }
  };

  useEffect(() => {
    if (loading || closing || atTurnLimit) cancelRecording('effect-loading-closing');
  }, [loading, closing, atTurnLimit, cancelRecording]);

  if (phase === 'basics') {
    return (
      <BasicsWizard
        formName={formName}
        formAge={formAge}
        formGender={formGender}
        formError={formError}
        step={basicsStep}
        onStepChange={setBasicsStep}
        onNameChange={setFormName}
        onAgeChange={setFormAge}
        onGenderChange={setFormGender}
        onClearError={() => setFormError(null)}
        onComplete={startInterview}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-12 w-full">
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
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-white">
            <Button
              type="button"
              variant={interviewMode === 'text' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => switchInterviewMode('text')}
              disabled={closing || loading || liveActive || liveStatus === 'connecting' || userTurns > 0}
            >
              <Keyboard size={14} />
              Texto
            </Button>
            <Button
              type="button"
              variant={interviewMode === 'voice' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => switchInterviewMode('voice')}
              disabled={closing || loading || liveActive || liveStatus === 'connecting' || userTurns > 0}
            >
              <Radio size={14} />
              Voz
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: MAX_TURNS }).map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i < displayTurns
                    ? 'w-6 bg-emerald-500'
                    : i === displayTurns && !atTurnLimit
                    ? 'w-6 bg-slate-300'
                    : 'w-2 bg-slate-200'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500 tabular-nums font-medium">
            {displayTurns}/{MAX_TURNS}
          </span>
          {userTurns >= MIN_TURNS && !atTurnLimit && (
            <Button type="button" variant="outline" size="sm" onClick={finishEarly} disabled={loading || closing}>
              Terminar ahora
            </Button>
          )}
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
        <section className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col min-h-[380px] max-h-[55vh] md:min-h-[520px] md:max-h-[600px] lg:min-h-[600px] lg:max-h-[700px] overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-5">
            {displayMessages.map((msg, i) => (
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
            {interviewMode === 'voice' && (liveUserText || liveAgentText) && (
              <div className="space-y-3 pt-2 border-t border-dashed border-slate-200">
                {liveUserText && (
                  <div className="flex gap-3 justify-end opacity-80">
                    <div className="px-4 py-2 rounded-2xl max-w-[85%] bg-slate-700/90 text-white text-sm italic">
                      {liveUserText}
                    </div>
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500">
                      <User size={16} />
                    </div>
                  </div>
                )}
                {liveAgentText && (
                  <div className="flex gap-3 justify-start opacity-80">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                      <Bot size={16} />
                    </div>
                    <div className="px-4 py-2 rounded-2xl max-w-[85%] bg-stone-50 border border-slate-100 text-slate-700 text-sm italic font-display">
                      {liveAgentText}
                    </div>
                  </div>
                )}
              </div>
            )}
            {(loading || closing) && interviewMode === 'text' && (
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
            {closing && interviewMode === 'voice' && (
              <div className="flex gap-3 justify-start">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50">
                  <Bot size={16} />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-stone-50 border border-slate-100 text-slate-800 rounded-bl-md flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="text-xs text-emerald-700 ml-2 font-medium">Construyendo tu Perfil de Evidencia…</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            {interviewMode === 'voice' ? (
              <>
                {liveError && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3" role="alert">
                    {liveError}
                  </p>
                )}
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    {liveStatus === 'connecting' && (
                      <>
                        <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                        Conectando…
                      </>
                    )}
                    {liveStatus === 'listening' && (
                      <>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Escuchando
                      </>
                    )}
                    {liveStatus === 'agentSpeaking' && (
                      <>
                        <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                        El agente está hablando
                      </>
                    )}
                    {liveStatus === 'idle' && !liveActive && (
                      <span>Tocá el botón para iniciar la conversación por voz</span>
                    )}
                    {liveStatus === 'closed' && !closing && (
                      <span>Sesión de voz finalizada</span>
                    )}
                    {liveStatus === 'error' && (
                      <span className="text-rose-600">Error de conexión — probá de nuevo o usá modo texto</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    variant={liveActive ? 'default' : 'outline'}
                    className={`h-20 w-20 rounded-full p-0 flex-shrink-0 ${
                      liveActive
                        ? liveStatus === 'agentSpeaking'
                          ? 'bg-violet-600 hover:bg-violet-700 animate-pulse'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                        : 'border-2 border-emerald-300'
                    }`}
                    onClick={() => void toggleLiveSession()}
                    disabled={closing || atTurnLimit}
                    title={liveActive ? 'Finalizar sesión de voz' : 'Iniciar conversación por voz'}
                    aria-label={liveActive ? 'Finalizar sesión de voz' : 'Iniciar conversación por voz'}
                  >
                    {liveActive ? <PhoneOff size={28} /> : <Phone size={28} />}
                  </Button>
                  <p className="text-[11px] text-slate-500 text-center max-w-sm leading-relaxed">
                    Modo voz en tiempo real: hablá naturalmente, el agente responde con voz de IA y ves la transcripción en vivo.
                  </p>
                </div>
              </>
            ) : (
              <>
                {voiceError && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3" role="alert">
                    {voiceError}
                  </p>
                )}
                <div className="flex gap-2 items-end">
                  {voiceSupported && (
                    <Button
                      type="button"
                      variant={isRecording ? 'default' : 'outline'}
                      className={`h-[64px] w-[64px] flex-shrink-0 p-0 ${
                        isRecording ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse' : ''
                      }`}
                      onClick={() => void toggleVoice()}
                      disabled={loading || closing || atTurnLimit || isTranscribing}
                      title={
                        isTranscribing
                          ? 'Transcribiendo tu respuesta…'
                          : isRecording
                          ? 'Detener y enviar respuesta'
                          : 'Dictar respuesta por voz'
                      }
                      aria-label={
                        isTranscribing
                          ? 'Transcribiendo respuesta'
                          : isRecording
                          ? 'Detener grabación y enviar'
                          : 'Dictar respuesta por voz'
                      }
                      aria-pressed={isRecording}
                    >
                      {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                    </Button>
                  )}
                  <Textarea
                    className="resize-none h-[64px] min-h-[64px] bg-white text-[15px] leading-relaxed"
                    value={input}
                    onChange={(e) => {
                      if (isRecording) cancelRecording('textarea-edit');
                      voiceBaseRef.current = '';
                      setInput(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendUserMessage();
                      }
                    }}
                    disabled={loading || closing || atTurnLimit || isRecording || isTranscribing}
                    placeholder={
                      atTurnLimit
                        ? 'Generando tu perfil…'
                        : isTranscribing
                        ? 'Transcribiendo tu respuesta…'
                        : isRecording
                        ? 'Grabando… hablá ahora. Tocá el micrófono otra vez para enviar.'
                        : voiceSupported
                        ? 'Escribí o usá el micrófono para responder…'
                        : 'Cuéntame con tus palabras…'
                    }
                  />
                  <Button
                    className="h-[64px] px-5 gap-2"
                    onClick={() => void sendUserMessage()}
                    disabled={loading || closing || atTurnLimit || isRecording || isTranscribing || !input.trim()}
                  >
                    Enviar <ArrowRight size={14} />
                  </Button>
                </div>
                {voiceSupported && !atTurnLimit && (
                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                    Podés hablar o escribir. Tocá el micrófono, contá tu respuesta y tocá de nuevo para enviar.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="lg:col-span-5 space-y-4 order-first lg:order-none">
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
