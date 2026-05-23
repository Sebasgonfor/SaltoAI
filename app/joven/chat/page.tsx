'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Bot, User } from 'lucide-react';

export default function ChatJoven() {
  const router = useRouter();
  const [messages, setMessages] = useState<{role: 'agent'|'user', content: string}[]>([
    { role: 'agent', content: '¡Hola! Soy tu asistente de Salto. No vamos a llenar un currículum aburrido hoy. Cuéntame, ¿cuál ha sido el desafío más grande que has resuelto en el último año, incluso si no te pagaron por ello?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const newMsgs = [...messages, { role: 'user', content: input } as const];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    try {
      // Usamos el API que creamos para simular la extracción
      const response = await fetch('/api/motor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input })
      });
      
      const data = await response.json();
      
      // Guardamos la data extraída en localStorage para el MVP
      localStorage.setItem('salto_perfil', JSON.stringify(data));
      
      // Simular que el agente terminó y generó el perfil
      setMessages(prev => [
        ...prev, 
        { role: 'agent', content: 'Fascinante. He extraído evidencia valiosa de lo que me acabas de contar. ¡Tu Perfil de Evidencia está listo!' }
      ]);
      
      setTimeout(() => {
        router.push('/joven/perfil');
      }, 2000);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'agent', content: 'Hubo un error al procesar tu historia. Intenta de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-slate-900">Tu Entrevista Conversacional</h1>
        <p className="text-slate-500">Convirtiendo tu historia en evidencia laboral.</p>
      </div>

      <Card className="flex-1 flex flex-col p-0 overflow-hidden bg-white min-h-[500px]">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'agent' && (
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                  <Bot size={18} />
                </div>
              )}
              
              <div className={`px-4 py-3 rounded-2xl max-w-[85%] ${
                msg.role === 'user' ? 'bg-slate-900 text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'
              }`}>
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-slate-600">
                  <User size={18} />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                <Bot size={18} />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-800 rounded-bl-none flex items-center gap-1">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex gap-2">
            <Textarea 
              placeholder="Escribe tu historia aquí..." 
              className="resize-none h-[60px] min-h-[60px]"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
            />
            <Button className="h-[60px] px-6" onClick={handleSend} disabled={loading || !input.trim()}>
              Enviar
            </Button>
          </div>
          <p className="text-xs text-center text-slate-400 mt-2">La IA de Salto estructurará tu perfil en base a esta conversación.</p>
        </div>
      </Card>
    </div>
  );
}
