'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bot, User, Sparkles, Layers, ArrowRight, MessageSquareQuote } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';

const INITIAL_MESSAGE: ChatMessage = {
  role: 'agent',
  content:
    'Hola, soy tu asistente de Salto. Hoy no vamos a llenar un currículum — vamos a conversar. Cuéntame: ¿cuál ha sido el desafío más grande que has resuelto en el último año, aunque nadie te haya pagado por hacerlo?',
};

const MAX_TURNS = 5;

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

export default function ChatJoven() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, closing]);

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

  const sendUserMessage = async () => {
    if (!input.trim() || loading || closing) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/entrevista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
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
          body: JSON.stringify({ messages: updated }),
        });
        const closeData = await closeRes.json();
        if (closeData.id) {
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 lg:py-12 w-full">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">Entrevista conversacional</div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
            Cuéntame tu historia.
          </h1>
          <p className="text-slate-600 mt-2 max-w-xl">
            5 minutos, 3-5 preguntas. Sin formularios. Vamos a sacar la evidencia que las empresas no ven en tu CV.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </header>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* CHAT */}
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
            <p className="text-[11px] text-slate-400 mt-2 px-1">
              <kbd className="px-1 py-0.5 text-[10px] bg-white border border-slate-200 rounded text-slate-500">Enter</kbd> envía · <kbd className="px-1 py-0.5 text-[10px] bg-white border border-slate-200 rounded text-slate-500">⇧ Enter</kbd> salto de línea
            </p>
          </div>
        </section>

        {/* SIDE PANEL — extraction live */}
        <aside className="lg:col-span-5 space-y-4">
          <div className="bg-slate-950 text-white rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl" aria-hidden />
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-emerald-400" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-semibold">Detectando en vivo</span>
              </div>
              <h2 className="font-display font-bold text-2xl tracking-tight mb-1 leading-tight">
                Señales en tu historia
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                A medida que cuentes, vamos marcando qué evidencias laborales aparecen. <span className="text-emerald-400">No es magia: es extracción semántica.</span>
              </p>

              {detected.size === 0 ? (
                <div className="text-sm text-slate-400 italic border border-dashed border-slate-700 rounded-xl p-4 text-center">
                  Aún no hay señales detectadas. Cuéntame qué hiciste, no qué quisiste hacer.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {SIGNALS.map((s) => {
                    const active = detected.has(s.label);
                    return (
                      <span
                        key={s.label}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
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
              <p className="text-[11px] text-slate-500 mt-1">Cuanto más concreto, mejor evidencia.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Señales</div>
              <div className="font-display font-bold text-3xl text-emerald-600 tabular-nums">{detected.size}</div>
              <p className="text-[11px] text-slate-500 mt-1">de {SIGNALS.length} posibles</p>
            </div>
          </div>

          <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-4 flex gap-3">
            <MessageSquareQuote size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-semibold">Tip:</strong> menciona cifras concretas si las recuerdas ("subí las ventas un X%", "manejé Y clientes"). Los detalles convierten anécdotas en evidencia.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-3">
            <Layers size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Tras <strong className="text-slate-900">{MAX_TURNS} turnos</strong>, generamos tu Perfil de Evidencia con cada habilidad anclada a una cita textual de esta conversación.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
