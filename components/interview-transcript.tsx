'use client';

/**
 * Sección "Mi entrevista" en el perfil del joven.
 *
 * Muestra la transcripción cruda de la conversación que generó el perfil.
 * Solo visible para el dueño del perfil (no para las empresas que lo navegan):
 *   - Es información de carrera del joven, no es señal de selección
 *   - El founder tiene la evidencia citada en el perfil, no necesita la
 *     conversación completa
 *
 * UX: colapsada por default — solo se expande si el joven quiere revisar
 * lo que contó.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquareQuote, Sparkles, User } from 'lucide-react';
import type { Role } from '@/lib/types';
import { Collapse } from '@/components/ui/motion';

interface TranscriptMessage {
  role: Role;
  content: string;
}

export function InterviewTranscript({
  transcript,
}: {
  transcript: TranscriptMessage[];
}) {
  const [open, setOpen] = useState(false);
  if (!transcript || transcript.length === 0) return null;

  const userTurns = transcript.filter((m) => m.role === 'user').length;

  return (
    <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-6 md:px-8 py-5 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <MessageSquareQuote size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-1">
              Tu entrevista guardada
            </div>
            <h3 className="font-display font-semibold text-lg text-slate-900 leading-tight">
              Así contaste tu historia
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {userTurns} {userTurns === 1 ? 'respuesta' : 'respuestas'} · de aquí salió tu Perfil de Evidencia
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />}
      </button>

      <Collapse open={open}>
        <div className="px-4 md:px-8 pb-6 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500 mb-4 italic">
            Esta es la conversación que generó tu perfil. Si querés actualizarla, andá a Entrevista y empezá una nueva.
          </p>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {transcript.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'agent' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 ring-2 ring-emerald-50">
                    <Sparkles size={12} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white rounded-br-md'
                      : 'bg-slate-50 border border-slate-100 text-slate-800 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0">
                    <User size={12} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Collapse>
    </section>
  );
}

export default InterviewTranscript;
