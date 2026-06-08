'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { User, Sparkles, Layers, ArrowRight, RotateCcw, Mic, MicOff, Phone, PhoneOff, Keyboard, Radio, Pause, Play } from 'lucide-react';
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
import { SIGNALS as SIGNAL_DEFS, detectSignalsInText } from '@/lib/signals';
import {
  fetchJovenBasicsFromProfile,
  loadSavedJovenBasics,
  saveJovenBasics,
} from '@/lib/user-onboarding-storage';
import { normalizeSlug, type RecruiterBrandPublic } from '@/lib/recruiter-config';

const MIN_TURNS = MIN_USER_TURNS;
const MAX_TURNS = MAX_USER_TURNS;

const CLOSING_AGENT_MSG = CLOSING_MESSAGE;

type InterviewMode = 'text' | 'voice';

function firstNameFrom(full: string): string {
  return full.trim().split(/\s+/)[0] || full.trim();
}

function applyBasicsToForm(
  basics: JovenBasics,
  setters: {
    setFormName: (v: string) => void;
    setFormAge: (v: string) => void;
    setFormGender: (v: Gender | '') => void;
    setBasicsStep: (v: 0 | 1 | 2) => void;
  }
) {
  setters.setFormName(basics.name);
  setters.setFormAge(String(basics.age));
  setters.setFormGender(basics.gender);
  setters.setBasicsStep(2);
}

interface DetectedSignal {
  id: string;
  label: string;
}

// Chips de "Señales en tu historia" — derivados de la fuente única
// lib/signals.ts para que coincidan con lo que detecta el backend (incluye
// las señales cualitativas: confiabilidad, atención al detalle, etc.).
const SIGNALS: DetectedSignal[] = SIGNAL_DEFS.map((s) => ({
  id: s.id,
  label: s.label,
}));

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
  const searchParams = useSearchParams();
  // Contexto de reclutadora: el slug viaja por `?r=` y/o localStorage (guardado
  // al pasar por la landing /r/[slug]). Si existe, el chat aplica la marca y
  // thread-ea el slug a /api/entrevista y /api/perfil. Sin slug → genérico.
  const [recruiterBrand, setRecruiterBrand] = useState<RecruiterBrandPublic | null>(null);
  const [recruiterSlug, setRecruiterSlug] = useState('');
  const recruiterSlugRef = useRef('');

  useEffect(() => {
    // Theming + asociación a la reclutadora SOLO dentro del flujo del link
    // /r/[slug]: el slug se deriva del query param `?r=` (que sobrevive a un
    // refresh). NO se persiste en localStorage a propósito — así la marca no se
    // "pega" a visitas normales a /joven/chat ni se filtra a otro candidato en
    // el mismo navegador. Sin `?r=` → experiencia genérica (emerald).
    const slug = normalizeSlug(searchParams?.get('r') || '');
    if (!slug) {
      recruiterSlugRef.current = '';
      setRecruiterSlug('');
      setRecruiterBrand(null);
      return;
    }
    recruiterSlugRef.current = slug;
    setRecruiterSlug(slug);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recruiter-config?slug=${encodeURIComponent(slug)}`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (data?.brand?.slug) setRecruiterBrand(data.brand as RecruiterBrandPublic);
      } catch {
        /* sin red: experiencia genérica */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const brandPrimary = recruiterBrand?.brand?.primaryColor || undefined;
  // Estilos derivados del color de marca para teñir los acentos del chat de
  // forma consistente (avatar del agente, contador, botón, chips, panel).
  // Sin marca → undefined → se conservan los emerald por defecto.
  const brandText = brandPrimary ? { color: brandPrimary } : undefined;
  const brandBtn = brandPrimary ? { backgroundColor: brandPrimary } : undefined;
  const brandAvatar = brandPrimary
    ? { backgroundColor: `${brandPrimary}1f`, color: brandPrimary }
    : undefined;
  const brandChipActive = brandPrimary
    ? { backgroundColor: `${brandPrimary}33`, color: '#fff', borderColor: `${brandPrimary}99` }
    : undefined;

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
  const resumeProfileBuildRef = useRef(false);
  const profileBuildInFlightRef = useRef(false);
  const skipAutoOpeningRef = useRef(false);
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
    pause: pauseLive,
    resume: resumeLive,
    clearError: clearLiveError,
    resetMessages: resetLiveMessages,
    isActive: liveActive,
  } = useLiveInterview({
    firstName: basics ? firstNameFrom(basics.name) : undefined,
    recruiterSlug: recruiterSlug || undefined,
    // Hard floor: el hook IGNORA closing keywords del agente hasta que
    // el user haya completado MIN_USER_TURNS rondas. Sin esto, Gemini
    // Live a veces decide cerrar prematuro y el perfil queda con 2 skills.
    minUserTurnsBeforeClose: MIN_USER_TURNS,
    onInterviewComplete: (conversation) => {
      // Doble defensa: el hook ya gatea, pero validamos otra vez por si
      // algún path lateral (race condition, refactor futuro) llamara el
      // callback con turnos insuficientes. Mejor reabrir la conversación
      // que generar un perfil pobre.
      const userTurnsInConv = conversation.filter((m) => m.role === 'user').length;
      if (userTurnsInConv < MIN_USER_TURNS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[chat] onInterviewComplete con userTurns=${userTurnsInConv} < MIN=${MIN_USER_TURNS}; ignorando cierre.`,
        );
        return;
      }
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

  const fetchOpeningQuestion = useCallback(async (name: string, age: number) => {
    // Intento principal + 1 reintento silencioso (500ms) ante errores de red
    // o respuesta sin pregunta. Si el segundo intento también falla,
    // propagamos el error — el caller decide cómo mostrarlo.
    const body = JSON.stringify({
      opening: true,
      firstName: firstNameFrom(name),
      age,
      ...(recruiterSlugRef.current && { recruiterSlug: recruiterSlugRef.current }),
    });

    const attempt = async () => {
      const res = await fetch('/api/entrevista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await res.json();
      // 429 = rate limit honesto — no reintentar acá, dejar que el usuario vea
      // el mensaje con el countdown del retryAfterSec.
      if (res.status === 429) {
        const err = new Error(data.error || 'Estamos a tope ahora mismo.') as Error & {
          retryAfterSec?: number;
          isRateLimit?: boolean;
        };
        err.retryAfterSec = data.retryAfterSec;
        err.isRateLimit = true;
        throw err;
      }
      if (!res.ok || !data.nextQuestion) {
        throw new Error(data.error || 'No pudimos preparar la entrevista.');
      }
      return data.nextQuestion as string;
    };

    try {
      return await attempt();
    } catch (err) {
      if ((err as { isRateLimit?: boolean })?.isRateLimit) throw err;
      // Reintento silencioso una vez. Si el backend ya devolvió `degraded`,
      // no llegamos acá (ya hay `nextQuestion`).
      await new Promise((r) => setTimeout(r, 500));
      return await attempt();
    }
  }, []);

  const beginInterview = useCallback(
    async (b: JovenBasics, opts?: { keepMessages?: boolean }) => {
      saveJovenBasics(user?.uid, b);
      setBasics(b);
      applyBasicsToForm(b, { setFormName, setFormAge, setFormGender, setBasicsStep });
      setFormError(null);
      setPhase('interview');

      if (interviewMode === 'text' && !opts?.keepMessages) {
        setMessages([]);
        setLoading(true);
        try {
          const opening = await fetchOpeningQuestion(b.name, b.age);
          setMessages([{ role: 'agent', content: opening }]);
        } catch (err) {
          setFormError(
            err instanceof Error ? err.message : 'No pudimos preparar la entrevista. Revisa tu conexión e intenta de nuevo.'
          );
        } finally {
          setLoading(false);
        }
      } else if (!opts?.keepMessages) {
        setMessages([]);
      }
    },
    [fetchOpeningQuestion, interviewMode, user?.uid]
  );

  // Restaurar estado al montar (una vez por uid). Si la sesión cambia de
  // usuario, leemos la persistencia del usuario nuevo y descartamos el
  // estado en memoria.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const saved = loadPersisted(user?.uid);
      if (saved) {
        if (Array.isArray(saved.messages)) setMessages(saved.messages);
        if (typeof saved.input === 'string') setInput(saved.input);
        if (saved.interviewMode === 'voice' || saved.interviewMode === 'text') {
          setInterviewMode(saved.interviewMode);
        }
      }

      let resolvedBasics = loadSavedJovenBasics(user?.uid);
      if (!resolvedBasics && user?.uid) {
        resolvedBasics = await fetchJovenBasicsFromProfile(user.uid);
        if (resolvedBasics) saveJovenBasics(user.uid, resolvedBasics);
      }
      if (!resolvedBasics && saved?.basics) {
        resolvedBasics = saved.basics;
        saveJovenBasics(user?.uid, resolvedBasics);
      }

      if (cancelled) return;

      const hasInterviewProgress = (saved?.messages?.length ?? 0) > 0;

      if (resolvedBasics) {
        setBasics(resolvedBasics);
        applyBasicsToForm(resolvedBasics, { setFormName, setFormAge, setFormGender, setBasicsStep });
        if (hasInterviewProgress) {
          setPhase('interview');
        } else {
          setPhase('interview');
          skipAutoOpeningRef.current = false;
        }
      } else if (saved) {
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
      }

      setRestored(true);
      resumeProfileBuildRef.current = false;
    }

    void restore();
    return () => {
      cancelled = true;
    };
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

  // En modo voz, `liveMessages` solo se popula cuando un TURNO se cierra
  // (el agente toma la palabra). Pero `liveUserText` se actualiza en cada
  // chunk de transcripción mientras el joven sigue hablando — esa es la
  // señal que el panel "Detectando en vivo" debe leer. Antes el cómputo
  // ignoraba `liveUserText` así que el contador y las señales quedaban
  // en 0 durante TODO el turno actual hasta que se cerrara.
  //
  // Solución: appendar `liveUserText` al texto del usuario cuando estamos
  // en modo voz y hay transcripción parcial activa. Se aplica tanto al
  // regex de señales como al wordsCount.
  const liveDraftText =
    interviewMode === 'voice' && (liveActive || liveStatus === 'agentSpeaking')
      ? liveUserText
      : '';

  const detected = useMemo(() => {
    const messageText = displayMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join(' ');
    const text = liveDraftText
      ? `${messageText} ${liveDraftText}`
      : messageText;
    return new Set<string>(detectSignalsInText(text));
  }, [displayMessages, liveDraftText]);

  const wordsCount = useMemo(() => {
    const messageWords = displayMessages
      .filter((m) => m.role === 'user')
      .reduce((acc, m) => acc + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
    const liveWords = liveDraftText
      ? liveDraftText.trim().split(/\s+/).filter(Boolean).length
      : 0;
    return messageWords + liveWords;
  }, [displayMessages, liveDraftText]);

  const resetInterview = () => {
    const confirmMsg = closing
      ? 'Todavía estamos construyendo tu perfil. ¿Cancelar y empezar la entrevista de cero?'
      : '¿Reiniciar la entrevista? Se borra la conversación actual. Tus datos básicos (nombre, edad, género) se mantienen.';
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return;
    cancelRecording('reset-interview');
    disconnectLive();
    clearPersisted(user?.uid);
    resetLiveMessages();
    setMessages([]);
    setInput('');
    setFormError(null);
    setLoading(false);
    setClosing(false);
    setInterviewMode('text');
    resumeProfileBuildRef.current = false;
    profileBuildInFlightRef.current = false;
    const savedBasics = loadSavedJovenBasics(user?.uid) ?? basics;
    if (savedBasics) {
      skipAutoOpeningRef.current = true;
      void beginInterview(savedBasics);
      return;
    }

    setBasics(null);
    setFormName(user?.displayName ?? '');
    setFormAge('');
    setFormGender('');
    setBasicsStep(0);
    setPhase('basics');
  };

  const startInterview = async () => {
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
    skipAutoOpeningRef.current = true;
    await beginInterview({ name, age, gender: formGender });
  };

  // Datos básicos ya guardados: abrir entrevista en texto sin repetir el wizard.
  useEffect(() => {
    if (!restored || phase !== 'interview' || !basics || messages.length > 0 || loading || closing) return;
    if (interviewMode !== 'text') return;
    if (skipAutoOpeningRef.current) {
      skipAutoOpeningRef.current = false;
      return;
    }
    skipAutoOpeningRef.current = true;
    setLoading(true);
    void fetchOpeningQuestion(basics.name, basics.age)
      .then((opening) => setMessages([{ role: 'agent', content: opening }]))
      .catch((err) =>
        setFormError(
          err instanceof Error ? err.message : 'No pudimos preparar la entrevista. Revisa tu conexión e intenta de nuevo.'
        )
      )
      .finally(() => setLoading(false));
  }, [restored, phase, basics, messages.length, loading, closing, interviewMode, fetchOpeningQuestion]);

  const finishInterview = useCallback(
    async (conversation: ChatMessage[]) => {
      if (!basics || closing || profileBuildInFlightRef.current) return;
      profileBuildInFlightRef.current = true;
      setClosing(true);
      setLoading(false);
      setFormError(null);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 90_000);
      try {
        const closeRes = await fetch('/api/perfil', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: conversation,
            basics,
            uid: user?.uid,
            displayName: user?.displayName,
            ...(recruiterSlugRef.current && {
              sourceRecruiterSlug: recruiterSlugRef.current,
            }),
          }),
          signal: controller.signal,
        });
        const closeData = await closeRes.json();
        if (closeRes.ok && closeData.id) {
          if (basics) saveJovenBasics(user?.uid, basics);
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
            'No pudimos construir tu perfil con lo que contaste. Profundiza un poco más con un ejemplo concreto.';
          setMessages((prev) => [...prev, { role: 'agent', content: fallback }]);
          setClosing(false);
          setFormError(closeData.error || 'No pudimos crear tu perfil. Intenta de nuevo.');
        }
      } catch (err) {
        console.error(err);
        setClosing(false);
        const timedOut = err instanceof Error && err.name === 'AbortError';
        setFormError(
          timedOut
            ? 'La construcción del perfil tardó demasiado. Usa «Reiniciar» o «Terminar ahora» para intentar de nuevo.'
            : 'Error de red al crear tu perfil. Revisa tu conexión e intenta de nuevo.'
        );
      } finally {
        window.clearTimeout(timeout);
        profileBuildInFlightRef.current = false;
      }
    },
    [basics, closing, router, user?.uid, user?.displayName]
  );

  useEffect(() => {
    finishInterviewRef.current = finishInterview;
  }, [finishInterview]);

  // Si el agente cerró la entrevista pero la construcción del perfil no llegó
  // a completarse (refresh, error de red, timeout), reintentamos al restaurar.
  useEffect(() => {
    if (!restored || closing || !basics || phase !== 'interview') return;
    if (resumeProfileBuildRef.current) return;
    const last = messages[messages.length - 1];
    if (last?.role !== 'agent' || last.content !== CLOSING_AGENT_MSG) return;
    if (messages.filter((m) => m.role === 'user').length < MIN_TURNS) return;
    resumeProfileBuildRef.current = true;
    void finishInterview(messages);
  }, [restored, closing, basics, phase, messages, finishInterview]);

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

    const reqBody = JSON.stringify({
      messages: history,
      firstName: firstNameFrom(basics.name),
      ...(recruiterSlugRef.current && { recruiterSlug: recruiterSlugRef.current }),
    });

    // Pide al backend la siguiente pregunta. 1 reintento silencioso ante
    // errores de red / 5xx. Los 429 (rate limit) NO se reintentan: se
    // muestran al usuario con el countdown del retryAfterSec.
    const fetchTurn = async () => {
      const res = await fetch('/api/entrevista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
      const data = await res.json();
      return { res, data };
    };

    try {
      let res: Response;
      let data: {
        nextQuestion?: string;
        done?: boolean;
        error?: string;
        retryAfterSec?: number;
        degraded?: boolean;
      };
      try {
        ({ res, data } = await fetchTurn());
        if (!res.ok && res.status !== 429) {
          // Reintento silencioso una vez ante 5xx / red.
          await new Promise((r) => setTimeout(r, 500));
          ({ res, data } = await fetchTurn());
        }
      } catch {
        // Excepción de red — reintento.
        await new Promise((r) => setTimeout(r, 500));
        ({ res, data } = await fetchTurn());
      }

      if (res.status === 429) {
        setLoading(false);
        const wait = data.retryAfterSec ? ` Intenta en ${data.retryAfterSec}s.` : '';
        setFormError((data.error || 'Estamos a tope ahora mismo.') + wait);
        return;
      }

      if (!res.ok) {
        setLoading(false);
        setFormError(data.error || 'No pudimos generar la siguiente pregunta. Intenta enviar de nuevo.');
        return;
      }

      const shouldClose = !!data.done || turnsAfterSend >= MAX_TURNS;
      const agentContent = shouldClose
        ? CLOSING_AGENT_MSG
        : data.nextQuestion;

      if (!shouldClose && !agentContent) {
        setLoading(false);
        setFormError('No recibimos una pregunta del agente. Intenta enviar de nuevo.');
        return;
      }

      const updated = [...history, { role: 'agent' as const, content: agentContent as string }];
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

  const startLiveSession = async () => {
    if (closing || liveActive || liveStatus === 'connecting') return;
    clearLiveError();
    await connectLive();
  };

  const endLiveSession = () => {
    if (closing) return;
    clearLiveError();
    disconnectLive();
  };

  const pauseLiveSession = () => {
    if (closing || (liveStatus !== 'listening' && liveStatus !== 'agentSpeaking')) return;
    pauseLive();
  };

  const resumeLiveSession = async () => {
    if (closing || liveStatus !== 'paused') return;
    clearLiveError();
    await resumeLive();
  };
  const switchInterviewMode = (mode: InterviewMode) => {
    if (closing || loading || liveActive || liveStatus === 'connecting') return;
    if (userTurns > 0) return;
    cancelRecording('mode-switch');
    disconnectLive();
    setInterviewMode(mode);
    if (mode === 'text' && basics) {
      setMessages([]);
      setLoading(true);
      void fetchOpeningQuestion(basics.name, basics.age)
        .then((opening) => setMessages([{ role: 'agent', content: opening }]))
        .catch((err) =>
          setFormError(
            err instanceof Error ? err.message : 'No pudimos preparar la entrevista en modo texto.'
          )
        )
        .finally(() => setLoading(false));
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
    // Full-height layout: ocupa todo el viewport menos los 80px del topbar
    // sticky del layout (h-20). El header del chat y el grid se reparten ese
    // espacio sin generar scroll externo en el body.
    <div
      className="lg:h-[calc(100dvh-5rem)] lg:overflow-hidden max-w-7xl mx-auto w-full flex flex-col px-4 sm:px-6 py-5 sm:py-6 pb-8"
      style={brandPrimary ? ({ ['--brand-primary' as string]: brandPrimary }) : undefined}
    >
      {recruiterBrand && (
        <div
          className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 flex-shrink-0"
          style={brandPrimary ? { borderColor: `${brandPrimary}55` } : undefined}
        >
          {recruiterBrand.brand?.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={recruiterBrand.brand.logoUrl}
              alt={recruiterBrand.displayName}
              className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200 flex-shrink-0"
            />
          ) : (
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
              style={{ backgroundColor: brandPrimary || '#059669' }}
            >
              <Sparkles size={16} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {recruiterBrand.displayName}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {recruiterBrand.interviewerName
                ? `Entrevista con ${recruiterBrand.interviewerName}`
                : 'Entrevista personalizada'}
            </div>
          </div>
        </div>
      )}
      <header className="mb-6 sm:mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-5 sm:gap-4 flex-shrink-0">
        <div className="space-y-3 sm:space-y-2.5">
          <div
            className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold"
            style={brandPrimary ? { color: brandPrimary } : undefined}
          >
            Paso 2 de 2 · Entrevista
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-snug">
            Cuéntame tu historia, {basics ? firstNameFrom(basics.name) : ''}.
          </h1>
          {/* `<Badge>` renderiza un `<div>`, así que el contenedor NO puede
              ser `<p>` (HTML inválido → hydration error). Usamos `<div>` y
              mantenemos el styling. */}
          <div className="text-slate-600 max-w-xl space-y-3">
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
            {user?.uid && (
              <p className="text-xs text-slate-500 leading-relaxed">
                Tus datos básicos ya están guardados.{' '}
                <Link
                  href={`/joven/perfil/${user.uid}#datos-personales`}
                  className="text-emerald-700 underline"
                  style={brandText}
                >
                  Editar en tu perfil
                </Link>
                {' · '}
                «Reiniciar» solo borra la conversación.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap w-full sm:w-auto sm:justify-end">
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-white shrink-0">
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
            <span className="relative inline-flex">
              <Button
                type="button"
                variant={interviewMode === 'voice' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => switchInterviewMode('voice')}
                disabled={closing || loading || liveActive || liveStatus === 'connecting' || userTurns > 0}
                title="Prueba el modo voz: habla tu historia en vez de escribirla. Suele ser más natural, rápido y fluido."
              >
                <Radio size={14} />
                Voz
              </Button>
              {/* Sugerencia visible del modo voz (general): punto que invita a
                  probarlo, solo antes de empezar a responder. */}
              {interviewMode === 'text' && userTurns === 0 && !closing && !loading && !liveActive && (
                <span
                  className="absolute -top-1 -right-1 flex h-2.5 w-2.5"
                  aria-hidden
                  title="Nuevo: prueba el modo voz"
                >
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
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
                style={i < displayTurns && brandPrimary ? { backgroundColor: brandPrimary } : undefined}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500 tabular-nums font-medium">
            {displayTurns}/{MAX_TURNS}
          </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {userTurns >= MIN_TURNS && !atTurnLimit && (
            <Button type="button" variant="outline" size="sm" onClick={finishEarly} disabled={loading || closing}>
              Terminar ahora
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={resetInterview}
            disabled={loading}
            className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 gap-1.5"
            title="Empezar de cero la entrevista (también durante la construcción del perfil)"
          >
            <RotateCcw size={14} />
            Reiniciar
          </Button>
          </div>
        </div>
      </header>

      {formError && phase === 'interview' && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{formError}</div>
      )}

      <div className="grid lg:grid-cols-12 gap-5 sm:gap-6 flex-1 min-h-0">
        <section className="lg:col-span-7 order-1 lg:order-none bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[min(70dvh,520px)] sm:min-h-[480px] lg:min-h-0 overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 min-h-0">
            {displayMessages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'agent' && (
                  <div
                    className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50"
                    style={brandAvatar}
                  >
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
                  <p className={`text-sm sm:text-[15px] whitespace-pre-wrap ${msg.role === 'agent' ? 'font-display' : ''}`}>{msg.content}</p>
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
            {interviewMode === 'voice' && (liveUserText || liveAgentText) && (
              <div className="space-y-3 pt-2 border-t border-dashed border-slate-200">
                {liveUserText && (
                  <div className="flex gap-3 justify-end opacity-80">
                    <div className="px-4 py-2 rounded-2xl max-w-[85%] bg-slate-700/90 text-white text-sm italic">
                      {liveUserText}
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
                {liveAgentText && (
                  <div className="flex gap-3 justify-start opacity-80">
                    <div
                      className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600"
                      style={brandAvatar}
                    >
                      <Sparkles size={16} />
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
                <div
                  className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50"
                  style={brandAvatar}
                >
                  <Sparkles size={16} />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-stone-50 border border-slate-100 text-slate-800 rounded-bl-md flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  {closing ? (
                    <span className="text-xs text-emerald-700 ml-2 font-medium">Construyendo tu Perfil de Evidencia…</span>
                  ) : (
                    <span className="text-xs text-emerald-700 ml-2 font-medium">
                      {messages.length === 0 ? 'Preparando tu entrevista…' : 'Pensando la siguiente pregunta…'}
                    </span>
                  )}
                </div>
              </div>
            )}
            {closing && interviewMode === 'voice' && (
              <div className="flex gap-3 justify-start">
                <div
                  className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 ring-4 ring-emerald-50"
                  style={brandAvatar}
                >
                  <Sparkles size={16} />
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

          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 space-y-3">
            {interviewMode === 'voice' ? (
              <>
                {liveError && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3" role="alert">
                    {liveError}
                  </p>
                )}
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    {liveStatus === 'connecting' && (
                      <>
                        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
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
                    {liveStatus === 'paused' && (
                      <>
                        <span className="w-2 h-2 bg-slate-400 rounded-full" />
                        Pausado — toca Retomar para continuar
                      </>
                    )}
                    {liveStatus === 'idle' && !liveActive && (
                      <span>Toca el botón para iniciar la conversación por voz</span>
                    )}
                    {liveStatus === 'closed' && !closing && (
                      <span>Sesión de voz finalizada</span>
                    )}
                    {liveStatus === 'error' && (
                      <span className="text-rose-600">Error de conexión — prueba de nuevo o usa modo texto</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(liveStatus === 'idle' || liveStatus === 'closed' || liveStatus === 'error') && !liveActive && (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="h-20 w-20 rounded-full p-0 flex-shrink-0 border-2 border-emerald-300"
                        onClick={() => void startLiveSession()}
                        disabled={closing || atTurnLimit}
                        title="Iniciar conversación por voz"
                        aria-label="Iniciar conversación por voz"
                      >
                        <Phone size={28} />
                      </Button>
                    )}
                    {(liveStatus === 'listening' || liveStatus === 'agentSpeaking') && (
                      <>
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          className="h-16 w-16 rounded-full p-0 flex-shrink-0 border-slate-300"
                          onClick={pauseLiveSession}
                          disabled={closing || atTurnLimit}
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
                            liveStatus === 'agentSpeaking'
                              ? 'bg-violet-600 hover:bg-violet-700 animate-pulse'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                          onClick={endLiveSession}
                          disabled={closing || atTurnLimit}
                          title="Finalizar sesión de voz"
                          aria-label="Finalizar sesión de voz"
                        >
                          <PhoneOff size={28} />
                        </Button>
                      </>
                    )}
                    {liveStatus === 'paused' && (
                      <>
                        <Button
                          type="button"
                          size="lg"
                          variant="default"
                          className="h-20 w-20 rounded-full p-0 flex-shrink-0 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => void resumeLiveSession()}
                          disabled={closing || atTurnLimit}
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
                          onClick={endLiveSession}
                          disabled={closing || atTurnLimit}
                          title="Finalizar sesión de voz"
                          aria-label="Finalizar sesión de voz"
                        >
                          <PhoneOff size={24} />
                        </Button>
                      </>
                    )}
                    {liveStatus === 'connecting' && (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="h-20 w-20 rounded-full p-0 flex-shrink-0 border-2 border-emerald-300"
                        disabled
                        aria-label="Conectando"
                      >
                        <Phone size={28} className="opacity-50" />
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 text-center max-w-sm leading-relaxed">
                    Modo voz en tiempo real: habla naturalmente, el agente responde con voz de IA y ves la transcripción en vivo.
                    Usa audífonos para mejor calidad.
                  </p>
                </div>
              </>
            ) : (
              <>
                {voiceError && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3" role="alert">
                    {voiceError}
                  </p>
                )}
                <div className="flex gap-2.5 sm:gap-2 items-stretch sm:items-end">
                  {voiceSupported && (
                    <Button
                      type="button"
                      variant={isRecording ? 'default' : 'outline'}
                      className={`h-11 w-11 sm:h-[64px] sm:w-[64px] flex-shrink-0 p-0 self-end sm:self-auto ${
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
                      {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                    </Button>
                  )}
                  <Textarea
                    className="resize-none flex-1 min-h-[2.75rem] sm:min-h-[64px] sm:h-[64px] py-2 sm:py-2 px-2.5 sm:px-3 bg-white text-[11px] sm:text-sm md:text-[15px] leading-snug placeholder:text-[11px] sm:placeholder:text-sm placeholder:text-slate-400"
                    rows={1}
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
                        ? 'Generando perfil…'
                        : isTranscribing
                        ? 'Transcribiendo…'
                        : isRecording
                        ? 'Grabando… toca mic para enviar'
                        : voiceSupported
                        ? 'Escribe o dicta…'
                        : 'Tu respuesta…'
                    }
                  />
                  <Button
                    className="h-11 sm:h-[64px] px-2.5 sm:px-5 gap-1.5 sm:gap-2 flex-shrink-0 self-end sm:self-auto text-white"
                    style={brandBtn}
                    onClick={() => void sendUserMessage()}
                    disabled={loading || closing || atTurnLimit || isRecording || isTranscribing || !input.trim()}
                  >
                    <span className="hidden sm:inline">Enviar</span>
                    <ArrowRight size={16} />
                  </Button>
                </div>
                {voiceSupported && !atTurnLimit && (
                  <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed px-0.5">
                    Puedes hablar o escribir. Toca el micrófono, cuenta tu respuesta y toca de nuevo para enviar.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="lg:col-span-5 order-2 lg:order-none space-y-4 lg:overflow-y-auto lg:h-full lg:min-h-0 lg:pr-1">
          <div className="bg-slate-950 text-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 relative overflow-hidden">
            <div className="relative space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-emerald-400 shrink-0" style={brandText} />
                <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold" style={brandText}>Detectando en vivo</span>
              </div>
              <h2 className="font-display font-bold text-xl sm:text-2xl tracking-tight leading-snug">Señales en tu historia</h2>
              {detected.size === 0 ? (
                <div className="text-sm text-slate-400 italic border border-dashed border-slate-700 rounded-xl px-4 py-5 sm:py-4 text-center leading-relaxed">
                  Cuéntame qué hiciste, no qué quisiste hacer.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {SIGNALS.map((s) => {
                    const active = detected.has(s.id);
                    return (
                      <span
                        key={s.id}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          active
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900/60 text-slate-500 border-slate-800'
                        }`}
                        style={active ? brandChipActive : undefined}
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

          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Palabras</div>
              <div className="font-display font-bold text-2xl sm:text-3xl text-slate-900 tabular-nums">{wordsCount}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Señales</div>
              <div className="font-display font-bold text-2xl sm:text-3xl text-emerald-600 tabular-nums" style={brandText}>{detected.size}</div>
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
